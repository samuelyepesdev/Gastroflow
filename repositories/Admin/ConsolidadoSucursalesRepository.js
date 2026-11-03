/**
 * ConsolidadoSucursalesRepository - ventas agregadas de varios locales (restaurante padre + sus
 * sucursales). Solo totales: nunca devuelve facturas individuales. Las ventas de eventos
 * (evento_id) quedan fuera, igual que en el resto de estadísticas.
 * Related to: services/Shared/ConsolidadoSucursalesService.js
 */

const db = require('../../config/database');
const { SQL_COLOMBIA, rangoUtcColombia, toFechaDia } = require('../../utils/dateHelpers');

class ConsolidadoSucursalesRepository {
    static async ventasPorLocal(tenantIds, desde, hasta) {
        const { utcDesde, utcHasta } = rangoUtcColombia(desde, hasta);
        const [rows] = await db.query(
            `SELECT tenant_id, COUNT(*) AS facturas, COALESCE(SUM(total), 0) AS ventas
             FROM facturas
             WHERE tenant_id IN (?) AND evento_aparte = 0 AND fecha BETWEEN ? AND ?
             GROUP BY tenant_id`,
            [tenantIds, utcDesde, utcHasta]
        );
        return rows.map(r => ({
            tenant_id: r.tenant_id,
            facturas: Number(r.facturas) || 0,
            ventas: parseFloat(r.ventas || 0)
        }));
    }

    static async ventasPorMedio(tenantIds, desde, hasta) {
        const { utcDesde, utcHasta } = rangoUtcColombia(desde, hasta);
        const [rows] = await db.query(
            `SELECT forma_pago, COUNT(*) AS cantidad, COALESCE(SUM(total), 0) AS total
             FROM facturas
             WHERE tenant_id IN (?) AND evento_aparte = 0 AND fecha BETWEEN ? AND ?
             GROUP BY forma_pago`,
            [tenantIds, utcDesde, utcHasta]
        );
        return rows.map(r => ({
            forma_pago: r.forma_pago,
            cantidad: Number(r.cantidad) || 0,
            total: parseFloat(r.total || 0)
        }));
    }

    /** Ventas por día (Colombia) sumando todos los locales; solo los días con ventas. */
    static async ventasPorDia(tenantIds, desde, hasta) {
        const { utcDesde, utcHasta } = rangoUtcColombia(desde, hasta);
        const [rows] = await db.query(
            `SELECT ${SQL_COLOMBIA.dia('fecha')} AS dia, COUNT(*) AS facturas, COALESCE(SUM(total), 0) AS ventas
             FROM facturas
             WHERE tenant_id IN (?) AND evento_aparte = 0 AND fecha BETWEEN ? AND ?
             GROUP BY ${SQL_COLOMBIA.dia('fecha')}`,
            [tenantIds, utcDesde, utcHasta]
        );
        return rows.map(r => ({
            dia: toFechaDia(r.dia),
            facturas: Number(r.facturas) || 0,
            ventas: parseFloat(r.ventas || 0)
        }));
    }
}

module.exports = ConsolidadoSucursalesRepository;
