/**
 * StatsService - Business logic layer for statistics
 * Handles statistics business logic
 * Related to: routes/dashboard.js, repositories/StatsRepository.js
 */

const StatsRepository = require('../../repositories/Tenant/StatsRepository');
const InventarioService = require('./InventarioService');

class StatsService {
    /**
     * Get dashboard statistics (scoped by tenant)
     * @param {number} tenantId - Tenant ID (multi-tenancy)
     * @param {Object} filters - Date filters (optional)
     * @returns {Promise<Object>} Dashboard statistics object
     */
    static async getDashboardStats(tenantId, filters = {}) {
        // Calcular fechas en timezone Colombia (America/Bogota), no en UTC
        const fechaHoyColombia = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }); // 'YYYY-MM-DD'
        const [anioColombia, mesColombia] = fechaHoyColombia.split('-').map(Number);
        const ultimoDiaMes = new Date(anioColombia, mesColombia, 0).getDate();
        const mesInicioStr = `${anioColombia}-${String(mesColombia).padStart(2, '0')}-01`;
        const mesFinStr = `${anioColombia}-${String(mesColombia).padStart(2, '0')}-${String(ultimoDiaMes).padStart(2, '0')}`;

        const desde = filters.desde || mesInicioStr;
        const hasta = filters.hasta || fechaHoyColombia;

        const mesInicio = mesInicioStr;
        const mesFin = mesFinStr;


        const [
            ventasHoy,
            ventasMes,
            totalSales,
            totalInvoices,
            topProducts,
            salesByCategory,
            topProductsByCategory,
            dailySales,
            eventStats,
            ventasPorEvento,
            eventosEnRango,
            eventosCalendario,
            totalSalesAllTime,
            totalInvoicesAllTime,
            paymentTotals,
            paymentTotalsAllTime,
            paymentTotalsMes
        ] = await Promise.all([
            StatsRepository.getVentasHoy(tenantId),
            StatsRepository.getVentasMes(tenantId),
            StatsRepository.getTotalSales(tenantId, filters),
            StatsRepository.getTotalInvoices(tenantId, filters),
            StatsRepository.getTopProducts(tenantId, 10, filters),
            StatsRepository.getSalesByCategory(tenantId, filters),
            StatsRepository.getTopProductsByCategory(tenantId, 5, filters),
            StatsRepository.getDailySales(tenantId, 30),
            StatsRepository.getEventStatsForDashboard(tenantId, desde, hasta),
            StatsRepository.getVentasPorEventoEnRango(tenantId, desde, hasta),
            StatsRepository.getEventosEnRango(tenantId, desde, hasta),
            StatsRepository.getEventosEnRango(tenantId, mesInicio, mesFin),
            StatsRepository.getTotalSalesAllTime(tenantId),
            StatsRepository.getTotalInvoicesAllTime(tenantId),
            StatsRepository.getTotalsByPaymentMethod(tenantId, filters),
            StatsRepository.getTotalsByPaymentMethod(tenantId, {}),
            StatsRepository.getTotalsByPaymentMethod(tenantId, { desde: mesInicio, hasta: mesFin })
        ]);

        let insumosBajoStock = 0;
        let insumosBajoStockLista = [];
        try {
            const resumen = await InventarioService.getResumenBajoStock(tenantId);
            insumosBajoStock = resumen.cantidad;
            insumosBajoStockLista = resumen.lista || [];
        } catch (e) {
            // Inventario puede no estar disponible en todos los tenants
        }

        return {
            ventasHoyTotal: ventasHoy.total,
            ventasHoyCantidad: ventasHoy.cantidad,
            ventasMesTotal: ventasMes.total,
            ventasMesCantidad: ventasMes.cantidad,
            totalSales,
            totalInvoices,
            totalSalesAllTime,
            totalInvoicesAllTime,
            topProducts,
            salesByCategory,
            topProductsByCategory,
            dailySales,
            eventos_count: eventStats.eventos_count,
            ventas_eventos_total: eventStats.ventas_eventos_total,
            ventas_eventos_cantidad: eventStats.ventas_eventos_cantidad,
            ventasPorEvento,
            eventosEnRango,
            eventosCalendario,
            insumosBajoStock,
            insumosBajoStockLista,
            totalEfectivo: paymentTotals.efectivo,
            totalTransferencia: paymentTotals.transferencia,
            totalServiciosExternos: paymentTotals.serviciosExternos,
            ventaNeta: (totalSales - paymentTotals.serviciosExternos),
            
            // Totales históricos (desde el día 1)
            totalEfectivoAllTime: paymentTotalsAllTime.efectivo,
            totalTransferenciaAllTime: paymentTotalsAllTime.transferencia,
            totalServiciosExternosAllTime: paymentTotalsAllTime.serviciosExternos,
            ventaNetaAllTime: (totalSalesAllTime - paymentTotalsAllTime.serviciosExternos),

            // Totales del mes actual
            totalEfectivoMes: paymentTotalsMes.efectivo,
            totalTransferenciaMes: paymentTotalsMes.transferencia,
            totalServiciosExternosMes: paymentTotalsMes.serviciosExternos,
            ventaNetaMes: (ventasMes.total - paymentTotalsMes.serviciosExternos)
        };
    }

    /**
     * Get statistics with custom date range
     * @param {number} tenantId - Tenant ID
     * @param {string} desde - Start date (YYYY-MM-DD)
     * @param {string} hasta - End date (YYYY-MM-DD)
     * @returns {Promise<Object>} Dashboard statistics object
     */
    static async getStatsByDateRange(tenantId, desde, hasta) {
        const filters = { desde, hasta };
        return await StatsService.getDashboardStats(tenantId, filters);
    }
}

module.exports = StatsService;

