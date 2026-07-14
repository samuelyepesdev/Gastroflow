/**
 * FacturaService - Business logic layer for invoices
 * Handles invoice business logic and validation
 * Related to: routes/facturas.js, repositories/FacturaRepository.js
 */

const FacturaRepository = require('../../repositories/Tenant/FacturaRepository');
const InventarioService = require('./InventarioService');

class FacturaService {
    /**
     * Create invoice with details. Valida stock para productos con receta y descuenta inventario.
     * @param {Object} facturaData - Invoice data
     * @returns {Promise<Object>} Created invoice result
     */
    static async create(tenantId, facturaData) {
        const { cliente_id, total, forma_pago, productos, evento_id } = facturaData;

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

        // Chequeo de stock en paralelo (cada producto es independiente) en vez de
        // secuencial: para una venta de N productos evita N round-trips en serie.
        const checks = await Promise.all(
            productos
                .filter(p => !p.es_servicio && p.producto_id)
                .map(p =>
                    InventarioService.checkStockParaProducto(tenantId, p.producto_id, parseFloat(p.cantidad) || 1)
                )
        );
        const todosLosFaltantes = checks.filter(c => !c.ok).flatMap(c => c.faltantes || []);
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
            evento_id: evento_id || null
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

            // Intento de detección de cerámicas
            try {
                for (const p of productos) {
                    let esCeramica = false;

                    // 1. Por nombre directo
                    if (p.nombre && p.nombre.toLowerCase().includes('cerámica')) {
                        esCeramica = true;
                    }
                    // 2. Por ID virtual de Insumo (> 1M)
                    else if (p.producto_id && p.producto_id > 1000000) {
                        const insumoDb = await InsumoRepository.findById(p.producto_id - 1000000, tenantId);
                        if (
                            insumoDb &&
                            (insumoDb.nombre.toLowerCase().includes('cerámica') ||
                                insumoDb.categoria_nombre === 'Cerámicas')
                        ) {
                            esCeramica = true;
                        }
                    }
                    // 3. Por Producto existente (si ya se creó)
                    else if (p.producto_id) {
                        const prodDb = await ProductRepository.findById(p.producto_id, tenantId);
                        if (
                            prodDb &&
                            (prodDb.nombre.toLowerCase().includes('cerámica') ||
                                prodDb.categoria_nombre === 'Cerámicas')
                        ) {
                            esCeramica = true;
                        }
                    }

                    if (esCeramica) {
                        tieneCeramicas = true;
                        break;
                    }
                }
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

        for (const p of productos) {
            try {
                if (!p.es_servicio && p.producto_id) {
                    await InventarioService.descontarPorReceta(
                        tenantId,
                        p.producto_id,
                        parseFloat(p.cantidad) || 1,
                        'factura_' + facturaId
                    );
                }
            } catch (err) {
                console.error('Error al descontar inventario por receta:', err);
            }
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
