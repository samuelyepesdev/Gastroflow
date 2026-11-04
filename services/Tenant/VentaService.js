/**
 * VentaService - Business logic layer for sales
 * Handles sales reporting business logic
 * Related to: routes/ventas.js, repositories/VentaRepository.js
 */

const VentaRepository = require('../../repositories/Tenant/VentaRepository');

class VentaService {
    /**
     * Get sales with filters (scoped by tenant)
     * @param {number} tenantId - Tenant ID
     * @param {Object} filters - Filter options
     * @returns {Promise<Array>} Array of sales
     */
    static async getWithFilters(tenantId, filters) {
        return await VentaRepository.getAllWithFilters(tenantId, filters);
    }

    /**
     * Get sales for Excel export (scoped by tenant)
     * @param {number} tenantId - Tenant ID
     * @param {Object} filters - Filter options
     * @returns {Promise<Array>} Array of sales data
     */
    static async getForExport(tenantId, filters) {
        return await VentaRepository.getForExport(tenantId, filters);
    }

    /**
     * Cuánto de una factura se pagó en efectivo, por transferencia y con bono. Las facturas hechas con la
     * lógica actual traen el desglose guardado (monto_*); las antiguas no, y se deducen de la forma de pago.
     * @returns {{ efectivo: number, transferencia: number, bono: number }}
     */
    static desglosePago(row) {
        const total = Number.parseFloat(row.total) || 0;
        const efectivo = Number.parseFloat(row.monto_efectivo) || 0;
        const transferencia = Number.parseFloat(row.monto_transferencia) || 0;
        const bono = Number.parseFloat(row.monto_bono) || 0;
        if (efectivo + transferencia + bono > 0) {
            return { efectivo, transferencia, bono };
        }
        const fp = String(row.forma_pago || '')
            .toLowerCase()
            .trim();
        return {
            efectivo: fp === 'efectivo' ? total : 0,
            transferencia: fp === 'transferencia' ? total : 0,
            bono: fp === 'bono' ? total : 0
        };
    }

    /**
     * Get tables with orders ready to pay (scoped by tenant)
     * @param {number} tenantId - Tenant ID
     * @returns {Promise<Array>} Array of tables with orders ready to pay
     */
    static async getTablesReadyToPay(tenantId) {
        return await VentaRepository.getTablesWithOrdersReadyToPay(tenantId);
    }
}

module.exports = VentaService;
