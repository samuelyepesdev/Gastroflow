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

        for (const p of productos) {
            if (!p.es_servicio && p.producto_id) {
                const check = await InventarioService.checkStockParaProducto(tenantId, p.producto_id, parseFloat(p.cantidad) || 1);
                if (!check.ok) {
                    const msg = (check.faltantes || []).map(f => `${f.insumo_nombre}: requiere ${f.requerido} ${f.unidad_base}, disponible ${f.disponible}`).join('; ');
                    throw new Error('No hay stock suficiente para realizar esta venta. ' + msg);
                }
            }
        }

        const result = await FacturaRepository.createWithDetails(tenantId, {
            cliente_id,
            total,
            forma_pago,
            productos,
            evento_id: evento_id || null
        });

        const facturaId = result.insertId;

        // --- INTEGRACIÓN CON FINANZAS ---
        const FinanzasService = require('./FinanzasService');
        try {
            // Verificamos si alguno de los productos es cerámica para categorizar el ingreso
            // Nota: Aquí se podría profundizar verificando la categoría del producto o insumo
            const tieneCeramicas = productos.some(p => p.nombre && p.nombre.toLowerCase().includes('cerámica'));
            
            await FinanzasService.registrarIngresoVenta(tenantId, {
                monto: total,
                factura_id: facturaId,
                esCeramica: tieneCeramicas
            });
        } catch (finErr) {
            console.error('Error al registrar ingreso en finanzas:', finErr);
        }
        // --------------------------------

        for (const p of productos) {
            try {
                if (!p.es_servicio && p.producto_id) {
                    await InventarioService.descontarPorReceta(tenantId, p.producto_id, parseFloat(p.cantidad) || 1, 'factura_' + facturaId);
                }
            } catch (err) {
                console.error('Error al descontar inventario por receta:', err);
            }
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
