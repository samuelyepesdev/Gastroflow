/**
 * StatsRepository - Data access layer for statistics
 * Handles all SQL queries related to sales statistics and analytics
 * Related to: routes/dashboard.js, services/StatsService.js
 */

const db = require('../../config/database');

/**
 * Retorna la fecha actual en timezone América/Bogotá (Colombia) como string 'YYYY-MM-DD'.
 * Evita usar CURDATE() de MySQL que opera en UTC del servidor.
 * @returns {string} Fecha en formato 'YYYY-MM-DD'
 */
function getFechaColombia() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

class StatsRepository {
    /**
     * Get total sales amount
     * @param {number} tenantId - Tenant ID (multi-tenancy)
     * @param {Object} filters - Date filters (optional)
     * @returns {Promise<number>} Total sales amount
     */
    static async getTotalSales(tenantId, filters = {}) {
        let query = 'SELECT COALESCE(SUM(total), 0) AS total FROM facturas WHERE tenant_id = ? AND evento_id IS NULL';
        const params = [tenantId];

        if (filters.desde && filters.hasta) {
            query += " AND DATE(CONVERT_TZ(fecha, '+00:00', '-05:00')) BETWEEN ? AND ?";
            params.push(filters.desde, filters.hasta);
        }

        const [result] = await db.query(query, params);
        return parseFloat(result[0]?.total || 0);
    }

    /**
     * Get total sales amount for all time
     * @param {number} tenantId - Tenant ID
     * @returns {Promise<number>} Total sales amount
     */
    static async getTotalSalesAllTime(tenantId) {
        const query = 'SELECT COALESCE(SUM(total), 0) AS total FROM facturas WHERE tenant_id = ? AND evento_id IS NULL';
        const [result] = await db.query(query, [tenantId]);
        return parseFloat(result[0]?.total || 0);
    }

    /**
     * Ventas del día de hoy (total en $ y cantidad de facturas).
     * @param {number} tenantId - Tenant ID
     * @returns {Promise<{ total: number, cantidad: number }>}
     */
    static async getVentasHoy(tenantId) {
        // Usar fecha de Colombia, no CURDATE() del servidor MySQL (que opera en UTC)
        const hoy = getFechaColombia();
        const [rows] = await db.query(
            `SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS cantidad
             FROM facturas WHERE tenant_id = ? AND evento_id IS NULL AND DATE(CONVERT_TZ(fecha, '+00:00', '-05:00')) = ?`,
            [tenantId, hoy]
        );
        const r = rows[0] || {};
        return {
            total: parseFloat(r.total || 0),
            cantidad: parseInt(r.cantidad || 0)
        };
    }

    /**
     * Ventas del mes (total en $ y cantidad de facturas).
     * @param {number} tenantId - Tenant ID
     * @returns {Promise<{ total: number, cantidad: number }>}
     */
    static async getVentasMes(tenantId) {
        const hoy = getFechaColombia();
        // Separamos para obtener YYYY-MM
        const parts = hoy.split('-');
        const yyyyMm = `${parts[0]}-${parts[1]}`;
        const mesInicioStr = `${yyyyMm}-01`;

        const [rows] = await db.query(
            `SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS cantidad
             FROM facturas WHERE tenant_id = ? AND evento_id IS NULL AND DATE(CONVERT_TZ(fecha, '+00:00', '-05:00')) BETWEEN ? AND ?`,
            [tenantId, mesInicioStr, hoy] // Hasta hoy, o podríamos usar LAST_DAY pero hoy es seguro porque es el máximo que hay facturado en el mes actual
        );
        const r = rows[0] || {};
        return {
            total: parseFloat(r.total || 0),
            cantidad: parseInt(r.cantidad || 0)
        };
    }

    /**
     * Get total number of invoices
     * @param {number} tenantId - Tenant ID
     * @param {Object} filters - Date filters (optional)
     * @returns {Promise<number>} Total invoices count
     */
    static async getTotalInvoices(tenantId, filters = {}) {
        let query = 'SELECT COUNT(*) AS total FROM facturas WHERE tenant_id = ? AND evento_id IS NULL';
        const params = [tenantId];

        if (filters.desde && filters.hasta) {
            query += " AND DATE(CONVERT_TZ(fecha, '+00:00', '-05:00')) BETWEEN ? AND ?";
            params.push(filters.desde, filters.hasta);
        }

        const [result] = await db.query(query, params);
        return parseInt(result[0]?.total || 0);
    }

    /**
     * Get total number of invoices for all time
     * @param {number} tenantId - Tenant ID
     * @returns {Promise<number>} Total invoices count
     */
    static async getTotalInvoicesAllTime(tenantId) {
        const query = 'SELECT COUNT(*) AS total FROM facturas WHERE tenant_id = ? AND evento_id IS NULL';
        const [result] = await db.query(query, [tenantId]);
        return parseInt(result[0]?.total || 0);
    }

    /**
     * Get sales by payment method
     * @param {number} tenantId - Tenant ID
     * @param {Object} filters - Date filters (optional)
     * @returns {Promise<Array>} Array of sales grouped by payment method
     */
    static async getSalesByPaymentMethod(tenantId, filters = {}) {
        let query = `
            SELECT forma_pago, COUNT(*) AS cantidad, SUM(total) AS total
            FROM facturas
            WHERE tenant_id = ? AND evento_id IS NULL
        `;
        const params = [tenantId];

        if (filters.desde && filters.hasta) {
            query += " AND DATE(CONVERT_TZ(fecha, '+00:00', '-05:00')) BETWEEN ? AND ?";
            params.push(filters.desde, filters.hasta);
        }

        query += ' GROUP BY forma_pago';

        const [result] = await db.query(query, params);
        return result.map(row => ({
            forma_pago: row.forma_pago,
            cantidad: parseInt(row.cantidad),
            total: parseFloat(row.total || 0)
        }));
    }

    /**
     * Get total amounts grouped by payment method (specifically Cash and Transfer)
     */
    static async getTotalsByPaymentMethod(tenantId, filters = {}) {
        let query = `
            SELECT f.forma_pago, 
                   COALESCE(SUM(f.total), 0) AS total,
                   COALESCE(SUM(t_ext.ext_sum), 0) AS total_externos
            FROM facturas f
            LEFT JOIN (
                SELECT df.factura_id, SUM(df.subtotal) AS ext_sum
                FROM detalle_factura df
                JOIN servicios s ON s.id = df.servicio_id
                WHERE df.es_servicio = 1 AND s.es_externo = 1
                GROUP BY df.factura_id
            ) t_ext ON t_ext.factura_id = f.id
            WHERE f.tenant_id = ? AND f.evento_id IS NULL
        `;
        const params = [tenantId];

        if (filters.desde && filters.hasta) {
            query += " AND DATE(CONVERT_TZ(f.fecha, '+00:00', '-05:00')) BETWEEN ? AND ?";
            params.push(filters.desde, filters.hasta);
        }

        query += ' GROUP BY f.forma_pago';

        const [result] = await db.query(query, params);
        
        const totals = {
            efectivo: 0,
            transferencia: 0,
            serviciosExternos: 0
        };

        result.forEach(row => {
            const fp = String(row.forma_pago || '').toLowerCase().trim();
            const totalFactura = parseFloat(row.total || 0);
            const totalExternos = parseFloat(row.total_externos || 0);
            const netSale = totalFactura - totalExternos;

            if (fp === 'efectivo') totals.efectivo += netSale;
            else if (fp === 'transferencia') totals.transferencia += netSale;
            
            totals.serviciosExternos += totalExternos;
        });

        return totals;
    }

    /**
     * Get top selling products
     * @param {number} tenantId - Tenant ID
     * @param {number} limit - Number of products to return (default: 10)
     * @param {Object} filters - Date filters (optional)
     * @returns {Promise<Array>} Array of top selling products
     */
    static async getTopProducts(tenantId, limit = 10, filters = {}) {
        let query = `
            SELECT 
                p.id,
                p.nombre,
                p.codigo,
                c.nombre AS categoria_nombre,
                SUM(df.cantidad) AS total_cantidad,
                SUM(df.subtotal) AS total_ventas,
                COUNT(DISTINCT df.factura_id) AS facturas_count
            FROM detalle_factura df
            INNER JOIN productos p ON df.producto_id = p.id
            LEFT JOIN categorias c ON p.categoria_id = c.id
            INNER JOIN facturas f ON df.factura_id = f.id
            WHERE f.tenant_id = ? AND f.evento_id IS NULL
        `;
        const params = [tenantId];

        if (filters.desde && filters.hasta) {
            query += " AND DATE(CONVERT_TZ(f.fecha, '+00:00', '-05:00')) BETWEEN ? AND ?";
            params.push(filters.desde, filters.hasta);
        }

        query += `
            GROUP BY p.id, p.nombre, p.codigo, c.nombre
            ORDER BY total_ventas DESC
            LIMIT ?
        `;
        params.push(limit);

        const [result] = await db.query(query, params);
        return result.map(row => ({
            id: row.id,
            nombre: row.nombre,
            codigo: row.codigo,
            categoria_nombre: row.categoria_nombre || 'Sin categoría',
            total_cantidad: parseFloat(row.total_cantidad || 0),
            total_ventas: parseFloat(row.total_ventas || 0),
            facturas_count: parseInt(row.facturas_count || 0)
        }));
    }

    /**
     * Get sales by category
     * @param {number} tenantId - Tenant ID
     * @param {Object} filters - Date filters (optional)
     * @returns {Promise<Array>} Array of sales grouped by category
     */
    static async getSalesByCategory(tenantId, filters = {}) {
        let query = `
            SELECT 
                COALESCE(c.nombre, 'Sin categoría') AS categoria_nombre,
                COUNT(DISTINCT df.factura_id) AS facturas_count,
                SUM(df.cantidad) AS total_cantidad,
                SUM(df.subtotal) AS total_ventas
            FROM detalle_factura df
            INNER JOIN productos p ON df.producto_id = p.id
            LEFT JOIN categorias c ON p.categoria_id = c.id
            INNER JOIN facturas f ON df.factura_id = f.id
            WHERE f.tenant_id = ? AND f.evento_id IS NULL
        `;
        const params = [tenantId];

        if (filters.desde && filters.hasta) {
            query += " AND DATE(CONVERT_TZ(f.fecha, '+00:00', '-05:00')) BETWEEN ? AND ?";
            params.push(filters.desde, filters.hasta);
        }

        query += ' GROUP BY c.id, c.nombre ORDER BY total_ventas DESC';

        const [result] = await db.query(query, params);
        return result.map(row => ({
            categoria_nombre: row.categoria_nombre,
            facturas_count: parseInt(row.facturas_count || 0),
            total_cantidad: parseFloat(row.total_cantidad || 0),
            total_ventas: parseFloat(row.total_ventas || 0)
        }));
    }

    /**
     * Get top products by category
     * @param {number} tenantId - Tenant ID
     * @param {number} limit - Number of products per category (default: 5)
     * @param {Object} filters - Date filters (optional)
     * @returns {Promise<Array>} Array of top products grouped by category
     */
    static async getTopProductsByCategory(tenantId, limit = 5, filters = {}) {
        let query = `
            SELECT 
                c.id AS categoria_id,
                COALESCE(c.nombre, 'Sin categoría') AS categoria_nombre,
                p.id AS producto_id,
                p.nombre AS producto_nombre,
                p.codigo,
                SUM(df.cantidad) AS total_cantidad,
                SUM(df.subtotal) AS total_ventas
            FROM detalle_factura df
            INNER JOIN productos p ON df.producto_id = p.id
            LEFT JOIN categorias c ON p.categoria_id = c.id
            INNER JOIN facturas f ON df.factura_id = f.id
            WHERE f.tenant_id = ? AND f.evento_id IS NULL
        `;
        const params = [tenantId];

        if (filters.desde && filters.hasta) {
            query += " AND DATE(CONVERT_TZ(f.fecha, '+00:00', '-05:00')) BETWEEN ? AND ?";
            params.push(filters.desde, filters.hasta);
        }

        query += `
            GROUP BY c.id, c.nombre, p.id, p.nombre, p.codigo
            ORDER BY categoria_nombre, total_ventas DESC
        `;

        const [result] = await db.query(query, params);

        // Group by category and limit products per category
        const grouped = {};
        result.forEach(row => {
            const categoria = row.categoria_nombre;
            if (!grouped[categoria]) {
                grouped[categoria] = [];
            }
            if (grouped[categoria].length < limit) {
                grouped[categoria].push({
                    producto_id: row.producto_id,
                    producto_nombre: row.producto_nombre,
                    codigo: row.codigo,
                    total_cantidad: parseFloat(row.total_cantidad || 0),
                    total_ventas: parseFloat(row.total_ventas || 0)
                });
            }
        });

        return Object.keys(grouped).map(categoria => ({
            categoria_nombre: categoria,
            productos: grouped[categoria]
        }));
    }

    /**
     * Get daily sales for the last N days
     * @param {number} tenantId - Tenant ID
     * @param {number} days - Number of days (default: 30)
     * @returns {Promise<Array>} Array of daily sales
     */
    static async getDailySales(tenantId, days = 30) {
        // Agrupar por fecha en Colombia (UTC-5) para que el gráfico de días sea correcto
        const query = `
            SELECT 
                DATE(CONVERT_TZ(fecha, '+00:00', '-05:00')) AS fecha,
                COUNT(*) AS cantidad_facturas,
                SUM(total) AS total_ventas
            FROM facturas
            WHERE tenant_id = ? AND evento_id IS NULL
              AND CONVERT_TZ(fecha, '+00:00', '-05:00') >= DATE_SUB(CONVERT_TZ(NOW(), '+00:00', '-05:00'), INTERVAL ? DAY)
            GROUP BY DATE(CONVERT_TZ(fecha, '+00:00', '-05:00'))
            ORDER BY fecha ASC
        `;
        const [result] = await db.query(query, [tenantId, days]);
        return result.map(row => {
            const f = row.fecha;
            const fechaStr = (f instanceof Date) ? f.toISOString().split('T')[0] : String(f || '').substring(0, 10);
            return {
                fecha: fechaStr,
                cantidad_facturas: parseInt(row.cantidad_facturas || 0),
                total_ventas: parseFloat(row.total_ventas || 0)
            };
        });
    }

    /**
     * Get sales aggregated by month for the last N months (for analytics and prediction).
     * @param {number} tenantId - Tenant ID
     * @param {number} months - Number of months (default: 3)
     * @param {Object} options - { excludeEventos: true } to exclude event sales (for prediction)
     * @returns {Promise<Array>} Array of { year, month, total_ventas, cantidad_facturas }
     */
    static async getMonthlySales(tenantId, months = 3, options = {}) {
        let query = `
            SELECT 
                YEAR(f.fecha) AS year,
                MONTH(f.fecha) AS month,
                COUNT(*) AS cantidad_facturas,
                COALESCE(SUM(f.total), 0) AS total_ventas
            FROM facturas f
            WHERE f.tenant_id = ?
              AND f.fecha >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL ? MONTH), '%Y-%m-01')
        `;
        if (options.excludeEventos) {
            query += ` AND f.evento_id IS NULL`;
        }
        query += `
            GROUP BY YEAR(f.fecha), MONTH(f.fecha)
            ORDER BY year ASC, month ASC
        `;
        const [result] = await db.query(query, [tenantId, months]);
        return result.map(row => ({
            year: row.year,
            month: row.month,
            cantidad_facturas: parseInt(row.cantidad_facturas || 0),
            total_ventas: parseFloat(row.total_ventas || 0)
        }));
    }

    /**
     * Event stats for dashboard: count of events and total sales from events in date range.
     * @param {number} tenantId - Tenant ID
     * @param {string} desde - Start date (YYYY-MM-DD)
     * @param {string} hasta - End date (YYYY-MM-DD)
     */
    static async getEventStatsForDashboard(tenantId, desde, hasta) {
        const [eventosCount] = await db.query(
            `SELECT COUNT(*) AS total FROM eventos 
             WHERE tenant_id = ? AND activo = TRUE 
             AND (fecha_inicio <= ? AND fecha_fin >= ?)`,
            [tenantId, hasta, desde]
        );
        const [ventasEventos] = await db.query(
            `SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS cantidad
             FROM facturas 
             WHERE tenant_id = ? AND evento_id IS NOT NULL 
             AND DATE(CONVERT_TZ(fecha, '+00:00', '-05:00')) BETWEEN ? AND ?`,
            [tenantId, desde, hasta]
        );
        return {
            eventos_count: parseInt(eventosCount[0]?.total || 0),
            ventas_eventos_total: parseFloat(ventasEventos[0]?.total || 0),
            ventas_eventos_cantidad: parseInt(ventasEventos[0]?.cantidad || 0)
        };
    }

    /** Ventas por evento en rango (para gráfica). */
    static async getVentasPorEventoEnRango(tenantId, desde, hasta) {
        const [rows] = await db.query(
            `SELECT e.id, e.nombre AS evento_nombre,
                    COUNT(f.id) AS cantidad_ventas,
                    COALESCE(SUM(f.total), 0) AS total_ventas
             FROM eventos e
             INNER JOIN facturas f ON f.evento_id = e.id AND f.tenant_id = e.tenant_id
             WHERE e.tenant_id = ? AND DATE(CONVERT_TZ(f.fecha, '+00:00', '-05:00')) BETWEEN ? AND ?
             GROUP BY e.id, e.nombre
             ORDER BY total_ventas DESC`,
            [tenantId, desde, hasta]
        );
        return (rows || []).map(r => ({
            evento_nombre: r.evento_nombre,
            total_ventas: parseFloat(r.total_ventas || 0),
            cantidad_ventas: parseInt(r.cantidad_ventas || 0)
        }));
    }

    /** Eventos que se solapan con [desde, hasta] (para mini calendario). */
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

module.exports = StatsRepository;

