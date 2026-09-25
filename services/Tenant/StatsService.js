/**
 * StatsService - Business logic layer for statistics
 * Handles statistics business logic
 * Related to: routes/dashboard.js, repositories/StatsRepository.js
 */

const StatsRepository = require('../../repositories/Tenant/StatsRepository');
const InventarioService = require('./InventarioService');
const cacheService = require('../Shared/CacheService');
const RealtimeEvents = require('../Shared/RealtimeEvents');

// Con una venta nueva, la caché de 2 min del dashboard queda desactualizada:
// se borra en el acto para que el refresco disparado por el mismo evento (SSE)
// traiga cifras reales, en vez de consultar cada 10 s esperando que expire.
RealtimeEvents.on('ventaRegistrada', ({ tenantId }) => {
    cacheService.deleteByPrefix(`tenant_dashboard_stats_${tenantId}_`);
});

class StatsService {
    /**
     * Get dashboard statistics (scoped by tenant)
     * @param {number} tenantId - Tenant ID (multi-tenancy)
     * @param {Object} filters - Date filters (optional)
     * @returns {Promise<Object>} Dashboard statistics object
     */
    static async getDashboardStats(tenantId, filters = {}) {
        const cacheKey = `tenant_dashboard_stats_${tenantId}_${JSON.stringify(filters)}`;
        const cached = cacheService.get(cacheKey);
        if (cached) {
            return cached;
        }

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

        // "Evolución de ventas" (dailySales) debe seguir el mismo rango elegido en el
        // selector Hoy/7 días/30 días -- se deriva la cantidad de días de desde/hasta
        // en vez de un fijo de 30 (que ignoraba por completo el filtro seleccionado).
        let dailySalesDays = 30;
        if (filters.desde && filters.hasta) {
            const diffDays = Math.round((new Date(`${hasta}T00:00:00`) - new Date(`${desde}T00:00:00`)) / 86400000);
            if (diffDays >= 0) {
                dailySalesDays = diffDays;
            }
        }

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
            paymentTotalsMes,
            paymentTotalsHoy
        ] = await Promise.all([
            StatsRepository.getVentasHoy(tenantId),
            StatsRepository.getVentasMes(tenantId),
            StatsRepository.getTotalSales(tenantId, filters),
            StatsRepository.getTotalInvoices(tenantId, filters),
            StatsRepository.getTopProducts(tenantId, 10, filters),
            StatsRepository.getSalesByCategory(tenantId, filters),
            StatsRepository.getTopProductsByCategory(tenantId, 5, filters),
            StatsRepository.getDailySales(tenantId, dailySalesDays),
            StatsRepository.getEventStatsForDashboard(tenantId, desde, hasta),
            StatsRepository.getVentasPorEventoEnRango(tenantId, desde, hasta),
            StatsRepository.getEventosEnRango(tenantId, desde, hasta),
            StatsRepository.getEventosEnRango(tenantId, mesInicio, mesFin),
            StatsRepository.getTotalSalesAllTime(tenantId),
            StatsRepository.getTotalInvoicesAllTime(tenantId),
            StatsRepository.getTotalsByPaymentMethod(tenantId, filters),
            StatsRepository.getTotalsByPaymentMethod(tenantId, {}),
            StatsRepository.getTotalsByPaymentMethod(tenantId, { desde: mesInicio, hasta: mesFin }),
            StatsRepository.getTotalsByPaymentMethod(tenantId, { desde: fechaHoyColombia, hasta: fechaHoyColombia })
        ]);

        let insumosBajoStock = 0;
        let insumosBajoStockLista = [];
        try {
            const resumen = await InventarioService.getResumenBajoStock(tenantId);
            insumosBajoStock = resumen.cantidad;
            insumosBajoStockLista = resumen.lista || [];
        } catch (error) {
            console.error('Error al obtener resumen de bajo stock de inventario:', error);
        }

        const stats = {
            ventasHoyTotal: ventasHoy.total,
            ventasHoyCantidad: ventasHoy.cantidad,
            // ventasHoyTotal es SUM(facturas.total) bruto (incluye servicios externos,
            // ej. domicilio de un tercero, que nunca fue ingreso propio -- se compensa
            // con una salida de caja). ventaNetaHoy es la cifra correcta para el card
            // "Ventas de hoy" del dashboard, igual que ya se hacía para ventaNetaMes.
            ventaNetaHoy: ventasHoy.total - paymentTotalsHoy.serviciosExternos,
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
            ventaNeta: totalSales - paymentTotals.serviciosExternos,

            // Totales históricos (desde el día 1)
            totalEfectivoAllTime: paymentTotalsAllTime.efectivo,
            totalTransferenciaAllTime: paymentTotalsAllTime.transferencia,
            totalServiciosExternosAllTime: paymentTotalsAllTime.serviciosExternos,
            ventaNetaAllTime: totalSalesAllTime - paymentTotalsAllTime.serviciosExternos,

            // Totales del mes actual
            totalEfectivoMes: paymentTotalsMes.efectivo,
            totalTransferenciaMes: paymentTotalsMes.transferencia,
            totalServiciosExternosMes: paymentTotalsMes.serviciosExternos,
            ventaNetaMes: ventasMes.total - paymentTotalsMes.serviciosExternos
        };

        // Cachear por 2 minutos (120 segundos)
        cacheService.set(cacheKey, stats, 120);
        return stats;
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
