/**
 * VentaRepository - Data access layer for sales
 * Handles all SQL queries related to sales and invoices
 * Related to: routes/ventas.js, services/VentaService.js
 */

const db = require('../../config/database');

class VentaRepository {
    /**
     * Get all sales with filters (scoped by tenant)
     * @param {number} tenantId - Tenant ID
     * @param {Object} filters - Filter options
     * @returns {Promise<Array>} Array of sales
     */
    static async getAllWithFilters(tenantId, filters) {
        let query = `
            SELECT f.id, f.numero, DATE_FORMAT(f.fecha, '%Y-%m-%d %H:%i:%s') AS fecha, f.cliente_id, f.forma_pago, f.total, f.evento_id,
                   c.nombre AS cliente_nombre,
                   e.nombre AS evento_nombre,
                   t.nombre AS tenant_nombre,
                   CASE WHEN f.evento_id IS NOT NULL THEN CONCAT('Evento: ', e.nombre) ELSE 'Venta diaria' END AS tipo_venta,
                   (SELECT COALESCE(SUM(df.subtotal), 0) FROM detalle_factura df JOIN servicios s ON s.id = df.servicio_id WHERE df.factura_id = f.id AND df.es_servicio = 1 AND s.es_externo = 1) AS total_servicios_externos,
                   (SELECT COALESCE(SUM(df.subtotal), 0) FROM detalle_factura df WHERE df.factura_id = f.id AND (df.es_servicio = 0 OR df.es_servicio IS NULL)) AS total_productos
            FROM facturas f
            JOIN tenants t ON f.tenant_id = t.id
            LEFT JOIN clientes c ON f.cliente_id = c.id
            LEFT JOIN eventos e ON f.evento_id = e.id
            WHERE 1=1
        `;
        const params = [];
        if (tenantId && tenantId !== 'all') {
            query += ` AND f.tenant_id = ?`;
            params.push(tenantId);
        }

        if (filters.desde) {
            query += ` AND DATE(f.fecha) >= ?`;
            params.push(filters.desde);
        }

        if (filters.hasta) {
            query += ` AND DATE(f.fecha) <= ?`;
            params.push(filters.hasta);
        }

        if (filters.q) {
            query += ` AND (CAST(f.id AS CHAR) LIKE ? OR c.nombre LIKE ? OR c.telefono LIKE ?)`;
            const searchTerm = `%${filters.q}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }

        if (filters.evento_id) {
            query += ` AND f.evento_id = ?`;
            params.push(filters.evento_id);
        }

        query += ` ORDER BY f.fecha DESC, f.id DESC`;

        const [ventas] = await db.query(query, params);
        return ventas;
    }

    /**
     * Get sales data for Excel export (scoped by tenant)
     * @param {number} tenantId - Tenant ID
     * @param {Object} filters - Filter options
     * @returns {Promise<Array>} Array of sales with details
     */
    static async getForExport(tenantId, filters) {
        let query = `
            SELECT 
                f.id,
                f.numero,
                DATE_FORMAT(f.fecha, '%Y-%m-%d %H:%i:%s') AS fecha,
                c.nombre AS cliente,
                f.forma_pago,
                f.total,
                f.evento_id,
                e.nombre AS evento_nombre,
                t.nombre AS tenant_nombre,
                CASE WHEN f.evento_id IS NOT NULL THEN CONCAT('Evento: ', e.nombre) ELSE 'Venta diaria' END AS tipo_venta
            FROM facturas f
            JOIN tenants t ON f.tenant_id = t.id
            LEFT JOIN clientes c ON f.cliente_id = c.id
            LEFT JOIN eventos e ON f.evento_id = e.id
            WHERE 1=1
        `;
        const params = [];
        if (tenantId && tenantId !== 'all') {
            query += ` AND f.tenant_id = ?`;
            params.push(tenantId);
        }

        if (filters.desde) {
            query += ` AND DATE(f.fecha) >= ?`;
            params.push(filters.desde);
        }

        if (filters.hasta) {
            query += ` AND DATE(f.fecha) <= ?`;
            params.push(filters.hasta);
        }

        if (filters.q) {
            query += ` AND (CAST(f.numero AS CHAR) LIKE ? OR CAST(f.id AS CHAR) LIKE ? OR c.nombre LIKE ? OR c.telefono LIKE ?)`;
            const searchTerm = `%${filters.q}%`;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }

        if (filters.evento_id) {
            query += ` AND f.evento_id = ?`;
            params.push(filters.evento_id);
        }

        query += ` ORDER BY f.fecha DESC, f.id DESC`;

        const [ventas] = await db.query(query, params);
        return ventas;
    }

    /**
     * Get tables with orders ready to pay (scoped by tenant)
     * @param {number} tenantId - Tenant ID
     * @returns {Promise<Array>} Array of tables with orders ready to pay
     */
    static async getTablesWithOrdersReadyToPay(tenantId) {
        const [mesas] = await db.query(`
            SELECT 
                m.id AS mesa_id,
                m.numero AS mesa_numero,
                m.estado AS mesa_estado,
                p.id AS pedido_id,
                COALESCE(SUM(pi.subtotal), 0) AS pedido_total,
                COUNT(DISTINCT pi.id) AS total_items,
                COUNT(DISTINCT CASE WHEN pi.estado IN ('listo', 'servido') THEN pi.id END) AS items_listos,
                MAX(pi.updated_at) AS ultima_actualizacion
            FROM mesas m
            INNER JOIN pedidos p ON p.mesa_id = m.id
            INNER JOIN pedido_items pi ON pi.pedido_id = p.id
            WHERE m.tenant_id = ?
            AND p.estado NOT IN ('cerrado', 'cancelado')
            AND pi.estado NOT IN ('cancelado')
            GROUP BY m.id, m.numero, m.estado, p.id
            HAVING items_listos > 0 
            AND items_listos = total_items
            ORDER BY CAST(m.numero AS UNSIGNED), m.numero ASC
        `, [tenantId]);
        return mesas;
    }
}

module.exports = VentaRepository;
