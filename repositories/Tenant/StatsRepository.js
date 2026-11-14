/**
 * StatsRepository - Unified Facade for statistics repositories
 * Delegates queries to domain-specific sub-repositories under repositories/Tenant/Stats/
 * Related to: routes/dashboard.js, services/StatsService.js
 */

const SalesStatsRepository = require('./Stats/SalesStatsRepository');
const ProductStatsRepository = require('./Stats/ProductStatsRepository');
const EventStatsRepository = require('./Stats/EventStatsRepository');

class StatsRepository {
    static async getTotalSales(tenantId, filters = {}) {
        return SalesStatsRepository.getTotalSales(tenantId, filters);
    }

    static async getTotalesAllTime(tenantId) {
        return SalesStatsRepository.getTotalesAllTime(tenantId);
    }

    static async getTotalSalesAllTime(tenantId) {
        return SalesStatsRepository.getTotalSalesAllTime(tenantId);
    }

    static async getPrimeraFechaVenta(tenantId) {
        return SalesStatsRepository.getPrimeraFechaVenta(tenantId);
    }

    static async getVentasHoy(tenantId) {
        return SalesStatsRepository.getVentasHoy(tenantId);
    }

    static async getVentasMes(tenantId) {
        return SalesStatsRepository.getVentasMes(tenantId);
    }

    static async getTotalInvoices(tenantId, filters = {}) {
        return SalesStatsRepository.getTotalInvoices(tenantId, filters);
    }

    static async getTotalInvoicesAllTime(tenantId) {
        return SalesStatsRepository.getTotalInvoicesAllTime(tenantId);
    }

    static async getSalesByPaymentMethod(tenantId, filters = {}) {
        return SalesStatsRepository.getSalesByPaymentMethod(tenantId, filters);
    }

    static async getTotalsByPaymentMethod(tenantId, filters = {}) {
        return SalesStatsRepository.getTotalsByPaymentMethod(tenantId, filters);
    }

    static async getTopProducts(tenantId, limit = 10, filters = {}) {
        return ProductStatsRepository.getTopProducts(tenantId, limit, filters);
    }

    static async getSalesByCategory(tenantId, filters = {}) {
        return ProductStatsRepository.getSalesByCategory(tenantId, filters);
    }

    static async getTopProductsByCategory(tenantId, limit = 5, filters = {}) {
        return ProductStatsRepository.getTopProductsByCategory(tenantId, limit, filters);
    }

    static async getDailySales(tenantId, days = 30) {
        return SalesStatsRepository.getDailySales(tenantId, days);
    }

    static async getDailySalesRange(tenantId, desde, hasta) {
        return SalesStatsRepository.getDailySalesRange(tenantId, desde, hasta);
    }

    static async getMonthlySales(tenantId, months = 3, options = {}) {
        return SalesStatsRepository.getMonthlySales(tenantId, months, options);
    }

    static async getEventStatsForDashboard(tenantId, desde, hasta) {
        return EventStatsRepository.getEventStatsForDashboard(tenantId, desde, hasta);
    }

    static async getVentasPorEventoEnRango(tenantId, desde, hasta) {
        return EventStatsRepository.getVentasPorEventoEnRango(tenantId, desde, hasta);
    }

    static async getEventosEnRango(tenantId, desde, hasta) {
        return EventStatsRepository.getEventosEnRango(tenantId, desde, hasta);
    }
}

module.exports = StatsRepository;
