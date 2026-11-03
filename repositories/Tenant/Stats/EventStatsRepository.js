const db = require('../../../config/database');
const { rangoUtcColombia } = require('../../../utils/dateHelpers');

class EventStatsRepository {
    static async getEventStatsForDashboard(tenantId, desde, hasta) {
        const [eventosCount] = await db.query(
            `SELECT COUNT(*) AS total FROM eventos 
             WHERE tenant_id = ? AND activo = TRUE 
             AND (fecha_inicio <= ? AND fecha_fin >= ?)`,
            [tenantId, hasta, desde]
        );

        const { utcDesde, utcHasta } = rangoUtcColombia(desde, hasta);
        const [ventasEventos] = await db.query(
            `SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS cantidad
             FROM facturas 
             WHERE tenant_id = ? AND evento_aparte = 1 
             AND fecha BETWEEN ? AND ?`,
            [tenantId, utcDesde, utcHasta]
        );
        return {
            eventos_count: parseInt(eventosCount[0]?.total || 0),
            ventas_eventos_total: parseFloat(ventasEventos[0]?.total || 0),
            ventas_eventos_cantidad: parseInt(ventasEventos[0]?.cantidad || 0)
        };
    }

    static async getVentasPorEventoEnRango(tenantId, desde, hasta) {
        const { utcDesde, utcHasta } = rangoUtcColombia(desde, hasta);
        const [rows] = await db.query(
            `SELECT e.id, e.nombre AS evento_nombre,
                    COUNT(f.id) AS cantidad_ventas,
                    COALESCE(SUM(f.total), 0) AS total_ventas
             FROM eventos e
             INNER JOIN facturas f ON f.evento_id = e.id AND f.tenant_id = e.tenant_id AND f.evento_aparte = 1
             WHERE e.tenant_id = ? AND f.fecha BETWEEN ? AND ?
             GROUP BY e.id, e.nombre
             ORDER BY total_ventas DESC`,
            [tenantId, utcDesde, utcHasta]
        );
        return (rows || []).map(r => ({
            evento_nombre: r.evento_nombre,
            total_ventas: parseFloat(r.total_ventas || 0),
            cantidad_ventas: parseInt(r.cantidad_ventas || 0)
        }));
    }

    static async getEventosEnRango(tenantId, desde, hasta) {
        const [rows] = await db.query(
            `SELECT id, nombre, fecha_inicio, fecha_fin
             FROM eventos
             WHERE tenant_id = ? AND fecha_inicio <= ? AND fecha_fin >= ?
             ORDER BY fecha_inicio`,
            [tenantId, hasta, desde]
        );
        return rows || [];
    }
}

module.exports = EventStatsRepository;
