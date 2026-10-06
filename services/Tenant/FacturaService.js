/**
 * FacturaService - Business logic layer for invoices
 * Handles invoice business logic and validation
 * Related to: routes/facturas.js, repositories/FacturaRepository.js
 */

const FacturaRepository = require('../../repositories/Tenant/FacturaRepository');
const InventarioService = require('./InventarioService');
const ModificadorService = require('./ModificadorService');
const ComboArmableService = require('./ComboArmableService');
const TenantOwnership = require('./TenantOwnership');

class FacturaService {
    /**
     * Create invoice with details. Valida stock para productos con receta y descuenta inventario.
     * @param {Object} facturaData - Invoice data
     * @returns {Promise<Object>} Created invoice result
     */
    static async create(tenantId, facturaData) {
        const { cliente_id, total, forma_pago, productos, evento_id, puedeUsarModificadores = true } = facturaData;

        if (!cliente_id || !productos || productos.length === 0) {
            throw new Error('Datos incompletos');
        }

        const AgregarItemService = require('./Mesas/AgregarItemService');

        // Resolver IDs virtuales de insumos (>= 1.000.000) a productos reales
        // Esto garantiza que siempre exista el producto espejo antes de facturar
        for (const p of productos) {
            if (!p.es_servicio && p.producto_id >= 1000000) {
                const insumoId = p.producto_id - 1000000;
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
                })
        );

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
            usuario_id: facturaData.usuario_id || null,
            efectivo_recibido: facturaData.efectivo_recibido || null,
            codigo_bono: facturaData.codigo_bono || null
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

        // --- INTEGRACIÓN CON FINANZAS (Garantizada) ---
        const FinanzasService = require('./FinanzasService');
        const InsumoRepository = require('../../repositories/Tenant/InsumoRepository');
        const ProductRepository = require('../../repositories/Tenant/ProductRepository');

        try {
            let tieneCeramicas = false;
            const usuario_id = facturaData.usuario_id || null;

            // Intento de detección de cerámicas: batch fetch (2 queries) en vez de
            // 1 query por producto (findById secuencial en el loop original).
            try {
                const insumoIds = productos
                    .filter(p => p.producto_id && p.producto_id > 1000000)
                    .map(p => p.producto_id - 1000000);
                const productoIds = productos
                    .filter(p => p.producto_id && p.producto_id <= 1000000)
                    .map(p => p.producto_id);

                const [insumosPorId, productosPorId] = await Promise.all([
                    InsumoRepository.findByIds(insumoIds, tenantId),
                    ProductRepository.findByIds(productoIds, tenantId)
                ]);

                tieneCeramicas = productos.some(p => {
                    // 1. Por nombre directo
                    if (p.nombre && p.nombre.toLowerCase().includes('cerámica')) {
                        return true;
                    }
                    // 2. Por ID virtual de Insumo (> 1M)
                    if (p.producto_id && p.producto_id > 1000000) {
                        const insumoDb = insumosPorId.get(p.producto_id - 1000000);
                        return !!(
                            insumoDb &&
                            (insumoDb.nombre.toLowerCase().includes('cerámica') ||
                                insumoDb.categoria_nombre === 'Cerámicas')
                        );
                    }
                    // 3. Por Producto existente (si ya se creó)
                    if (p.producto_id) {
                        const prodDb = productosPorId.get(p.producto_id);
                        return !!(
                            prodDb &&
                            (prodDb.nombre.toLowerCase().includes('cerámica') ||
                                prodDb.categoria_nombre === 'Cerámicas')
                        );
                    }
                    return false;
                });
            } catch (e) {
                console.error('Error opcional en detección de cerámicas:', e);
            }

            // REGISTRO FINAL (Siempre se ejecuta)
            await FinanzasService.registrarIngresoVenta(tenantId, {
                monto: total,
                factura_id: facturaId,
                esCeramica: tieneCeramicas,
                usuario_id: usuario_id
            });
        } catch (finErr) {
            console.error('CRÍTICO: Error al registrar ingreso en finanzas:', finErr);
        }
        // --------------------------------

        // Descuento de inventario en paralelo: cada producto es independiente y cada
        // fallo se captura por-item (igual que antes), así que no hay razón para serializar.
        await Promise.all(
            productos
                .filter(p => !p.es_servicio && p.producto_id)
                .map(async p => {
                    try {
                        await InventarioService.descontarPorReceta(
                            tenantId,
                            p.producto_id,
                            parseFloat(p.cantidad) || 1,
                            'factura_' + facturaId
                        );
                    } catch (err) {
                        console.error('Error al descontar inventario por receta:', err);
                    }
                })
        );

        // Combos armados: receta de cada producto elegido (best-effort, no lanza).
        if (productos.some(p => p.combo_id)) {
            await InventarioService.descontarPorCombosFactura(tenantId, facturaId);
        }

        // Descuento por toppings/modificadores ligados a inventario (opt-in por grupo).
        try {
            await InventarioService.descontarPorModificadoresFactura(tenantId, facturaId);
        } catch (err) {
            console.error('Error al descontar inventario por modificadores:', err);
        }

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
