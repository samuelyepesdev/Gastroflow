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
const { desglosarPago } = require('../../utils/desglosePago');
const cacheService = require('../Shared/CacheService');

const MOTIVO_FACTURA_ELECTRONICA = {
    codigo: 'FACTURA_ELECTRONICA',
    mensaje: 'Las facturas electrónicas no se pueden editar'
};
const MOTIVO_TURNO_CERRADO = {
    codigo: 'TURNO_CERRADO',
    mensaje: 'El turno de caja de esta factura ya está cerrado: no se puede cambiar la forma de pago'
};
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
     * Qué se puede corregir de una factura (para el modal de edición): cliente siempre que no sea
     * electrónica, y forma de pago solo si además su turno de caja sigue abierto y hubo cobro en dinero.
     */
    static async getEditable(tenantId, facturaId) {
        const factura = await FacturaService._cargarParaEditar(tenantId, facturaId);
        const electronica = Number(factura.tiene_fe) > 0;
        const pendiente = FacturaService._pendienteEnDinero(factura);
        const motivoPago = FacturaService._motivoPagoNoEditable(factura, pendiente);
        return {
            id: factura.id,
            numero: factura.numero ?? factura.id,
            cliente_id: factura.cliente_id,
            cliente_nombre: factura.cliente_nombre || null,
            electronica,
            total: Number(factura.total) || 0,
            monto_bono: Number(factura.monto_bono) || 0,
            pendiente_en_dinero: pendiente,
            forma_pago: factura.forma_pago,
            monto_efectivo: Number(factura.monto_efectivo) || 0,
            monto_transferencia: Number(factura.monto_transferencia) || 0,
            pago_editable: motivoPago === null,
            pago_motivo: motivoPago ? motivoPago.mensaje : null
        };
    }

    /**
     * Corrige cómo se cobró una factura normal (efectivo, transferencia o mixto con su desglose), solo mientras
     * el turno de caja donde se cobró siga abierto. No cambia el total, el bono, el inventario ni finanzas.
     * @returns {Promise<{id:number, forma_pago:string, monto_efectivo:number, monto_transferencia:number}>}
     */
    static async editarPago(tenantId, facturaId, datos = {}) {
        const formaPago = datos.forma_pago;
        if (!['efectivo', 'transferencia', 'mixto'].includes(formaPago)) {
            throw new ValidationError('Forma de pago inválida', 'FORMA_PAGO_INVALIDA');
        }

        const factura = await FacturaService._cargarParaEditar(tenantId, facturaId);
        const pendiente = FacturaService._pendienteEnDinero(factura);
        const motivo = FacturaService._motivoPagoNoEditable(factura, pendiente);
        if (motivo) {
            throw motivo.codigo === 'SIN_COBRO_EN_DINERO'
                ? new ValidationError(motivo.mensaje, motivo.codigo)
                : new ConflictError(motivo.mensaje, motivo.codigo);
        }

        // Mismo reparto que al cobrar (bono incluido): 'mixto' debe sumar exactamente lo que se cobró en dinero.
        let cobro;
        try {
            cobro = desglosarPago({
                formaPago,
                pendiente,
                montoBono: Number(factura.monto_bono) || 0,
                efectivo: datos.monto_efectivo,
                transferencia: datos.monto_transferencia
            });
        } catch (error) {
            throw new ValidationError(error.message, 'PAGO_INVALIDO');
        }

        // Efectivo recibido (informativo): solo se conserva si sigue cubriendo el efectivo a cobrar.
        const recibido = Number(factura.efectivo_recibido) || 0;
        const efectivoRecibido = cobro.montoEfectivo > 0 && recibido >= cobro.montoEfectivo ? recibido : null;

        const r = await FacturaRepository.updatePago(Number(factura.id), tenantId, {
            formaPago: cobro.formaPago,
            montoEfectivo: cobro.montoEfectivo,
            montoTransferencia: cobro.montoTransferencia,
            efectivoRecibido
        });
        if (!r.updated) {
            const m = r.motivo === 'TURNO_CERRADO' ? MOTIVO_TURNO_CERRADO : MOTIVO_FACTURA_ELECTRONICA;
            if (r.motivo === 'NO_ENCONTRADA') {
                throw new NotFoundError('Factura no encontrada', 'FACTURA_NO_ENCONTRADA');
            }
            throw new ConflictError(m.mensaje, m.codigo);
        }

        // El dashboard muestra las ventas por forma de pago: se invalida su caché (best-effort).
        try {
            cacheService.deleteByPrefix(`tenant_dashboard_stats_${tenantId}`);
            cacheService.delete('superadmin_dashboard_stats');
        } catch (cacheErr) {
            console.error('Error opcional al invalidar caché de estadísticas:', cacheErr);
        }

        return {
            id: Number(factura.id),
            forma_pago: cobro.formaPago,
            monto_efectivo: cobro.montoEfectivo,
            monto_transferencia: cobro.montoTransferencia
        };
    }

    static async _cargarParaEditar(tenantId, facturaId) {
        const id = Number(facturaId);
        if (!Number.isInteger(id) || id <= 0) {
            throw new ValidationError('Factura inválida', 'FACTURA_INVALIDA');
        }
        const factura = await FacturaRepository.findParaEditar(id, tenantId);
        if (!factura) {
            throw new NotFoundError('Factura no encontrada', 'FACTURA_NO_ENCONTRADA');
        }
        return factura;
    }

    /** Lo que se cobró en dinero (total menos bono). */
    static _pendienteEnDinero(factura) {
        const pendiente = (Number(factura.total) || 0) - (Number(factura.monto_bono) || 0);
        return Math.round(pendiente * 100) / 100;
    }

    /** null si la forma de pago se puede corregir; si no, { codigo, mensaje } con la razón. */
    static _motivoPagoNoEditable(factura, pendiente) {
        if (Number(factura.tiene_fe) > 0) {
            return MOTIVO_FACTURA_ELECTRONICA;
        }
        if (factura.caja_sesion_id && factura.estado_caja !== 'abierta') {
            return MOTIVO_TURNO_CERRADO;
        }
        if (pendiente <= 0) {
            return { codigo: 'SIN_COBRO_EN_DINERO', mensaje: 'Esta factura se pagó completa con bono' };
        }
        return null;
    }

    /**
     * Corrige el cliente de una factura normal (no mueve dinero ni stock).
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

        const factura = await FacturaRepository.findParaEditar(id, tenantId);
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
