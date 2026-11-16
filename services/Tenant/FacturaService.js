/**
 * FacturaService - Business logic layer for invoices
 * Handles invoice business logic and validation
 * Related to: routes/facturas.js, repositories/FacturaRepository.js
 */

const FacturaRepository = require('../../repositories/Tenant/FacturaRepository');
const { esIdInsumoVirtual, insumoIdDeVirtual } = require('../../utils/insumoVirtual');
const { validarLineas, exigirMonto } = require('../../utils/validacionLineas');
const InventarioService = require('./InventarioService');
const ModificadorService = require('./ModificadorService');
const ComboArmableService = require('./ComboArmableService');
const PrecioCatalogoService = require('./PrecioCatalogoService');
const PostVentaService = require('./Facturacion/PostVentaService');
const TenantOwnership = require('./TenantOwnership');
const EventoRepository = require('../../repositories/Tenant/EventoRepository');
const ClienteRepository = require('../../repositories/Tenant/ClienteRepository');
const { ValidationError, NotFoundError, ConflictError } = require('../../utils/errors');
const { hoyColombia, resolverDiaPasado, toFechaDia } = require('../../utils/dateHelpers');

/** Error de datos del usuario: el controlador lo devuelve como 400 con su mensaje. */
function errorDeValidacion(mensaje) {
    const err = new Error(mensaje);
    err.status = 400;
    return err;
}

/**
 * Día en que se registra la venta cuando NO es hoy ('YYYY-MM-DD'), o null si es hoy. Solo las ventas de un
 * evento pueden llevar otra fecha (el POS y las mesas siempre venden "ahora"), y debe caer dentro de los
 * días del evento.
 */
function resolverDiaVenta(fecha, eventoId, evento) {
    if (fecha === undefined || fecha === null || fecha === '') {
        return null;
    }
    let dia;
    try {
        dia = resolverDiaPasado(fecha, 'La fecha de la venta');
    } catch (e) {
        throw errorDeValidacion(e.message);
    }
    if (dia === hoyColombia()) {
        return null;
    }
    if (!eventoId) {
        throw errorDeValidacion('Solo las ventas de un evento pueden registrarse en otra fecha.');
    }
    if (evento && (dia < toFechaDia(evento.fecha_inicio) || dia > toFechaDia(evento.fecha_fin))) {
        throw errorDeValidacion('La fecha de la venta debe estar dentro de los días del evento.');
    }
    return dia;
}

/**
 * Reglas de la venta de un evento: el evento debe estar activo, la fecha elegida debe ser válida y se decide
 * si la factura cuenta aparte de las ventas normales (eventoAparte) según `eventos.incluir_en_ventas`.
 * @returns {Promise<{ dia: string|null, eventoAparte: boolean }>}
 */
async function resolverVentaDeEvento(tenantId, fecha, eventoId) {
    const evento = eventoId ? await EventoRepository.findById(eventoId, tenantId) : null;
    if (evento && !evento.activo) {
        throw errorDeValidacion('El evento está inactivo: no se pueden registrar ventas.');
    }
    return {
        dia: resolverDiaVenta(fecha, eventoId, evento),
        eventoAparte: Boolean(eventoId) && !(evento && evento.incluir_en_ventas)
    };
}

class FacturaService {
    /**
     * Create invoice with details. Valida stock para productos con receta y descuenta inventario.
     * @param {Object} facturaData - Invoice data
     * @returns {Promise<Object>} Created invoice result
     */
    static async create(tenantId, facturaData) {
        const {
            cliente_id,
            total,
            forma_pago,
            productos,
            evento_id,
            puedeUsarModificadores = true,
            puedeAplicarDescuento = false
        } = facturaData;

        if (!cliente_id || !productos || productos.length === 0) {
            throw new Error('Datos incompletos');
        }

        // Forma numérica de lo que manda el cliente (cantidad > 0, precios/subtotales/total >= 0 y finitos).
        validarLineas(productos);
        exigirMonto(total, 'El total');

        const AgregarItemService = require('./Mesas/AgregarItemService');

        // Resolver IDs virtuales de insumos (>= 1.000.000) a productos reales
        // Esto garantiza que siempre exista el producto espejo antes de facturar
        for (const p of productos) {
            if (!p.es_servicio && esIdInsumoVirtual(p.producto_id)) {
                const insumoId = insumoIdDeVirtual(p.producto_id);
                p.producto_id = await AgregarItemService._getOrCreateMirrorProduct(tenantId, insumoId, p.precio);
            }
        }

        // Combos armados: el precio y lo elegido se resuelven contra el catálogo (nunca lo que dijo el
        // frontend). Quedan como líneas sin producto (producto_id NULL + combo_id), como los servicios.
        for (const [i, p] of productos.entries()) {
            if (p.combo_id) {
                productos[i] = await ComboArmableService.resolverLineaVenta(tenantId, p);
            }
        }

        // Los ids relacionados vienen del cliente: todos deben ser de este tenant (si no, la factura
        // referenciaría clientes/productos de otro restaurante y los leería al imprimirse).
        await TenantOwnership.clientes(tenantId, cliente_id);
        await TenantOwnership.eventos(tenantId, evento_id);
        const { dia: diaVenta, eventoAparte } = await resolverVentaDeEvento(tenantId, facturaData.fecha, evento_id);
        await TenantOwnership.productos(
            tenantId,
            productos.filter(p => !p.es_servicio).map(p => p.producto_id)
        );
        await TenantOwnership.servicios(
            tenantId,
            productos.filter(p => p.es_servicio).map(p => p.servicio_id)
        );

        // Precio de toppings/modificadores: el catálogo en BD es la fuente de verdad,
        // nunca el precio que calculó el frontend. Se suma al precio base (que ya puede
        // traer descuento aplicado) y se recalcula el subtotal de la línea.
        await Promise.all(
            productos
                .filter(p => !p.es_servicio && p.producto_id)
                .map(async p => {
                    const { precioAdicionalTotal, lineasSnapshot } = await ModificadorService.validarYCalcularSeleccion(
                        tenantId,
                        p.producto_id,
                        p.modificadores_seleccion || [],
                        { permitido: puedeUsarModificadores }
                    );
                    if (precioAdicionalTotal > 0) {
                        p.precio = (parseFloat(p.precio) || 0) + precioAdicionalTotal;
                        p.subtotal = p.precio * (parseFloat(p.cantidad) || 1);
                    }
                    p._modificadoresSnapshot = lineasSnapshot;
                    p._precioAdicional = precioAdicionalTotal;
                })
        );

        // Sin permiso de descuento, solo vale catálogo - promoción vigente (calculada aquí, no por el cliente).
        await PrecioCatalogoService.exigirSinDescuentoNoAutorizado(tenantId, productos, total, puedeAplicarDescuento);

        // Chequeo de stock en paralelo (cada producto es independiente) en vez de
        // secuencial: para una venta de N productos evita N round-trips en serie.
        const checks = await Promise.all(
            productos
                .filter(p => !p.es_servicio && p.producto_id)
                .map(p =>
                    InventarioService.checkStockParaProducto(tenantId, p.producto_id, parseFloat(p.cantidad) || 1)
                )
        );
        const checksCombos = await Promise.all(
            productos
                .filter(p => p.combo_id)
                .map(p => InventarioService.checkStockParaSelecciones(tenantId, p._comboSelecciones, p.cantidad))
        );
        const todosLosFaltantes = [...checks, ...checksCombos].filter(c => !c.ok).flatMap(c => c.faltantes || []);
        if (todosLosFaltantes.length > 0) {
            const msg = todosLosFaltantes
                .map(f => `${f.insumo_nombre}: requiere ${f.requerido} ${f.unidad_base}, disponible ${f.disponible}`)
                .join('; ');
            throw new Error('No hay stock suficiente para realizar esta venta. ' + msg);
        }

        const result = await FacturaRepository.createWithDetails(tenantId, {
            cliente_id,
            total,
            forma_pago,
            productos,
            evento_id: evento_id || null,
            fecha_venta: diaVenta,
            evento_aparte: eventoAparte,
            monto_efectivo: facturaData.monto_efectivo,
            monto_transferencia: facturaData.monto_transferencia,
            usuario_id: facturaData.usuario_id || null,
            pedido_abono_id: facturaData.pedido_abono_id || null,
            efectivo_recibido: facturaData.efectivo_recibido || null,
            codigo_bono: facturaData.codigo_bono || null,
            // Ingreso en finanzas e inventario dentro de la MISMA transacción de la factura: todo o nada.
            enTransaccion: (connection, { facturaId }) =>
                PostVentaService.registrarEfectosEnTransaccion(connection, {
                    tenantId,
                    facturaId,
                    lineas: productos,
                    total,
                    usuarioId: facturaData.usuario_id || null,
                    fecha: diaVenta
                })
        });

        const facturaId = result.insertId;

        // Factura electrónica, sello de fidelización y caché: tras el commit y sin tumbar nunca la venta.
        await PostVentaService.ejecutarEfectosPostCommit({
            tenantId,
            facturaId,
            clienteId: cliente_id,
            total,
            usuarioId: facturaData.usuario_id || null
        });

        return { id: facturaId, numero: result.numero };
    }

    /**
     * Get invoice by ID for printing (does not include config)
     * @param {number} id - Invoice ID
     * @returns {Promise<Object>} Invoice data with client and details
     * @throws {Error} If invoice not found
     */
    static async getByIdForPrint(id, tenantId) {
        const factura = await FacturaRepository.findByIdWithClient(id, tenantId);
        if (!factura) {
            throw new Error('Factura no encontrada');
        }

        const detalles = await FacturaRepository.getDetailsByFacturaId(id);
        if (!detalles || detalles.length === 0) {
            throw new Error('No se encontraron detalles de la factura');
        }

        return { factura, detalles };
    }

    /**
     * Get invoice details for API (within tenant)
     * @param {number} id - Invoice ID
     * @param {number} tenantId - Tenant ID
     * @returns {Promise<Object>} Invoice details object
     * @throws {Error} If invoice not found
     */
    static async getDetails(id, tenantId) {
        const details = await FacturaRepository.getDetailsForAPI(id, tenantId);
        if (!details) {
            throw new Error('Factura no encontrada');
        }
        return details;
    }

    /**
     * Corrige el cliente de una factura normal. Es lo único editable: no mueve dinero ni stock.
     * Las facturas con facturación electrónica (cualquier estado) no se pueden editar.
     * @returns {Promise<{id:number, cliente_id:number}>}
     */
    static async editarCliente(tenantId, facturaId, clienteId) {
        const id = Number(facturaId);
        const nuevoClienteId = Number(clienteId);
        if (!Number.isInteger(id) || id <= 0) {
            throw new ValidationError('Factura inválida', 'FACTURA_INVALIDA');
        }
        if (!Number.isInteger(nuevoClienteId) || nuevoClienteId <= 0) {
            throw new ValidationError('Selecciona un cliente válido', 'CLIENTE_INVALIDO');
        }

        const factura = await FacturaRepository.findParaEditarCliente(id, tenantId);
        if (!factura) {
            throw new NotFoundError('Factura no encontrada', 'FACTURA_NO_ENCONTRADA');
        }
        if (Number(factura.tiene_fe) > 0) {
            throw new ConflictError('Las facturas electrónicas no se pueden editar', 'FACTURA_ELECTRONICA');
        }

        // El cliente llega del navegador: debe ser de este restaurante (si no, se leería el de otro).
        const cliente = await ClienteRepository.findById(nuevoClienteId, tenantId);
        if (!cliente) {
            throw new NotFoundError('Cliente no encontrado', 'CLIENTE_NO_ENCONTRADO');
        }

        const actualizada = await FacturaRepository.updateCliente(id, tenantId, nuevoClienteId);
        if (!actualizada) {
            throw new ConflictError('Las facturas electrónicas no se pueden editar', 'FACTURA_ELECTRONICA');
        }
        return { id, cliente_id: nuevoClienteId, cliente_nombre: cliente.nombre };
    }
}

module.exports = FacturaService;
