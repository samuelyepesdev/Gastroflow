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
const TenantOwnership = require('./TenantOwnership');
const FidelizacionService = require('./FidelizacionService');
const EventoRepository = require('../../repositories/Tenant/EventoRepository');
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
                FacturaService._registrarEfectosEnTransaccion(connection, {
                    tenantId,
                    facturaId,
                    productos,
                    total,
                    usuarioId: facturaData.usuario_id || null,
                    diaVenta
                })
        });

        const facturaId = result.insertId;

        // --- FACTURACIÓN ELECTRÓNICA (opcional, no bloquea la venta) ---
        try {
            const FacturacionElectronicaConfigService = require('./FacturacionElectronicaConfigService');
            await FacturacionElectronicaConfigService.encolarSiActivo(facturaId, tenantId);
        } catch (feErr) {
            console.error('Error opcional al encolar factura electrónica:', feErr);
        }
        // --------------------------------

        // Sello de fidelización (igual que al cobrar una mesa): ya con la venta guardada y sin lanzar nunca;
        // es idempotente por factura y solo aplica si el cliente tiene tarjeta.
        await FidelizacionService.sellarPorFactura({
            tenantId,
            facturaId,
            clienteId: cliente_id,
            total,
            usuarioId: facturaData.usuario_id || null
        });

        // --- INVALIDAR CACHÉ DE ESTADÍSTICAS (Actualización instantánea del Dashboard) ---
        try {
            const cacheService = require('../Shared/CacheService');
            cacheService.deleteByPrefix(`tenant_dashboard_stats_${tenantId}`);
            cacheService.delete('superadmin_dashboard_stats');
        } catch (cacheErr) {
            console.error('Error opcional al invalidar caché de estadísticas:', cacheErr);
        }

        return { id: facturaId, numero: result.numero };
    }

    /**
     * Efectos de la venta que deben quedar atómicos con la factura: ingreso en finanzas y descuento de
     * inventario (recetas, combos y toppings). Corre DENTRO de la transacción de createWithDetails y usa
     * SOLO `connection` para escribir (ver el gancho `enTransaccion` del repositorio). Un error aquí revierte
     * la venta completa: antes se registraba en consola y la factura quedaba sin ingreso o sin descuento.
     */
    static async _registrarEfectosEnTransaccion(
        connection,
        { tenantId, facturaId, productos, total, usuarioId, diaVenta }
    ) {
        const FinanzasService = require('./FinanzasService');
        const InsumoRepository = require('../../repositories/Tenant/InsumoRepository');
        const ProductRepository = require('../../repositories/Tenant/ProductRepository');

        // Detección de cerámicas (solo lecturas; batch de 2 consultas). Si falla, se asume que no hay.
        let tieneCeramicas = false;
        try {
            const insumoIds = productos
                .filter(p => p.producto_id && esIdInsumoVirtual(p.producto_id))
                .map(p => insumoIdDeVirtual(p.producto_id));
            const productoIds = productos
                .filter(p => p.producto_id && !esIdInsumoVirtual(p.producto_id))
                .map(p => p.producto_id);

            const [insumosPorId, productosPorId] = await Promise.all([
                InsumoRepository.findByIds(insumoIds, tenantId),
                ProductRepository.findByIds(productoIds, tenantId)
            ]);

            tieneCeramicas = productos.some(p => {
                if (p.nombre && p.nombre.toLowerCase().includes('cerámica')) {
                    return true;
                }
                if (p.producto_id && esIdInsumoVirtual(p.producto_id)) {
                    const insumoDb = insumosPorId.get(insumoIdDeVirtual(p.producto_id));
                    return !!(
                        insumoDb &&
                        (insumoDb.nombre.toLowerCase().includes('cerámica') ||
                            insumoDb.categoria_nombre === 'Cerámicas')
                    );
                }
                if (p.producto_id) {
                    const prodDb = productosPorId.get(p.producto_id);
                    return !!(
                        prodDb &&
                        (prodDb.nombre.toLowerCase().includes('cerámica') || prodDb.categoria_nombre === 'Cerámicas')
                    );
                }
                return false;
            });
        } catch (e) {
            console.error('Error opcional en detección de cerámicas:', e);
        }

        await FinanzasService.registrarIngresoVenta(tenantId, {
            monto: total,
            factura_id: facturaId,
            esCeramica: tieneCeramicas,
            usuario_id: usuarioId,
            fecha: diaVenta,
            conn: connection
        });

        // Recetas de todas las líneas, sumadas por insumo, en la conexión de la venta.
        await InventarioService.descontarProductosLote(
            tenantId,
            productos
                .filter(p => !p.es_servicio && p.producto_id)
                .map(p => ({ producto_id: p.producto_id, cantidad: parseFloat(p.cantidad) || 1 })),
            'factura_' + facturaId,
            connection
        );

        // Combos armados y toppings se leen de las filas de detalle recién insertadas (solo visibles aquí).
        if (productos.some(p => p.combo_id)) {
            await InventarioService.descontarPorCombosFactura(tenantId, facturaId, connection);
        }
        await InventarioService.descontarPorModificadoresFactura(tenantId, facturaId, connection);
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
}

module.exports = FacturaService;
