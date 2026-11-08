/**
 * VentaRepository - Data access layer for sales
 * Handles all SQL queries related to sales and invoices
 * Related to: routes/ventas.js, services/VentaService.js
 */

const db = require('../../config/database');
const { SQL_COLOMBIA } = require('../../utils/dateHelpers');

class VentaRepository {
    /**
     * Get all sales with filters (scoped by tenant)
     * @param {number} tenantId - Tenant ID
     * @param {Object} filters - Filter options
     * @returns {Promise<Array>} Array of sales
     */
    static async getAllWithFilters(tenantId, filters, paginacion) {
        const { where, params } = VentaRepository._whereVentas(tenantId, filters);
        let query = `
            SELECT f.id, f.numero, DATE_FORMAT(f.fecha, '%Y-%m-%d %H:%i:%s') AS fecha, f.cliente_id, f.forma_pago, f.total, f.evento_id,
                   c.nombre AS cliente_nombre,
                   e.nombre AS evento_nombre,
                   t.nombre AS tenant_nombre,
                   CASE WHEN f.evento_id IS NOT NULL THEN CONCAT('Evento: ', e.nombre) ELSE 'Venta diaria' END AS tipo_venta,
                   fe.estado AS estado_fe,
                   (SELECT COALESCE(SUM(df.subtotal), 0) FROM detalle_factura df JOIN servicios s ON s.id = df.servicio_id WHERE df.factura_id = f.id AND df.es_servicio = 1 AND s.es_externo = 1) AS total_servicios_externos,
                   (SELECT COALESCE(SUM(df.subtotal), 0) FROM detalle_factura df WHERE df.factura_id = f.id AND (df.es_servicio = 0 OR df.es_servicio IS NULL)) AS total_productos
            ${VentaRepository._fromVentas}
            ${where}
            ORDER BY f.fecha DESC, f.id DESC`;
        if (paginacion) {
            // Sin paginación se devuelve todo (comportamiento original).
            query += ' LIMIT ? OFFSET ?';
            params.push(paginacion.limit, (Math.max(paginacion.page, 1) - 1) * paginacion.limit);
        }
        const [ventas] = await db.query(query, params);
        return ventas;
    }

    /** Cantidad de ventas que cumplen los filtros (para paginar). */
    static async contarConFilters(tenantId, filters) {
        const { where, params } = VentaRepository._whereVentas(tenantId, filters);
        const [[row]] = await db.query(`SELECT COUNT(*) AS total ${VentaRepository._fromVentas} ${where}`, params);
        return Number(row.total) || 0;
    }

    /** Facturas del tenant emitidas hoy (día Colombia), sin importar los filtros de la lista. */
    static async contarHoy(tenantId) {
        const [[row]] = await db.query(
            `SELECT COUNT(*) AS total FROM facturas f
             WHERE f.tenant_id = ? AND f.fecha >= ${SQL_COLOMBIA.inicioHoyUtc}`,
            [tenantId]
        );
        return Number(row.total) || 0;
    }

    static get _fromVentas() {
        return `FROM facturas f
            JOIN tenants t ON f.tenant_id = t.id
            LEFT JOIN clientes c ON f.cliente_id = c.id AND c.tenant_id = f.tenant_id
            LEFT JOIN eventos e ON f.evento_id = e.id AND e.tenant_id = f.tenant_id
            LEFT JOIN facturas_electronicas fe ON fe.factura_id = f.id`;
    }

    static _whereVentas(tenantId, filters) {
        let where = 'WHERE 1=1';
        const params = [];
        if (tenantId && tenantId !== 'all') {
            where += ' AND f.tenant_id = ?';
            params.push(tenantId);
        }

        if (filters.desde) {
            // Sargable (sin función sobre f.fecha, usa el índice). El día del filtro es
            // un día Colombia y f.fecha está en UTC: se convierte el límite, no la columna.
            // Sin esto, lo vendido después de las 7 p. m. caía en el día siguiente.
            where += ` AND f.fecha >= ${SQL_COLOMBIA.desdeDia()}`;
            params.push(filters.desde);
        }

        if (filters.hasta) {
            // Igual que arriba: rango sargable en vez de DATE(f.fecha) <= ?. Incluye
            // todo el día "hasta" comparando contra el inicio del día siguiente.
            where += ` AND f.fecha < ${SQL_COLOMBIA.hastaDia()}`;
            params.push(filters.hasta);
        }

        if (filters.formaPago) {
            where += ' AND f.forma_pago = ?';
            params.push(filters.formaPago);
        }

        if (filters.q) {
            // Incluye el "#" que muestra la lista (numero, o el id si no tiene).
            where += ` AND (CAST(f.id AS CHAR) LIKE ? OR CAST(f.numero AS CHAR) LIKE ? OR c.nombre LIKE ? OR c.telefono LIKE ?)`;
            const searchTerm = `%${filters.q}%`;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }

        if (filters.evento_id) {
            where += ' AND f.evento_id = ?';
            params.push(filters.evento_id);
        }
        return { where, params };
    }

    /**
     * Página de ventas para el panel superadmin (liviana: sin subconsultas por fila).
     * Los filtros (restaurante, rango, forma de pago, búsqueda) se aplican en SQL para que
     * los conteos y el monto sean los de TODAS las páginas, no solo la visible.
     * @param {number|'all'} tenantId
     * @param {{desde?:string, hasta?:string, q?:string, formaPago?:string}} filters
     * @param {{page:number, limit:number}} paginacion
     * @returns {Promise<{ventas: Array, total: number, montoTotal: number}>}
     */
    static async getPaginaAdmin(tenantId, filters, { page, limit }) {
        let where = ' WHERE 1=1';
        const params = [];
        if (tenantId && tenantId !== 'all') {
            where += ' AND f.tenant_id = ?';
            params.push(tenantId);
        }
        if (filters.desde) {
            where += ` AND f.fecha >= ${SQL_COLOMBIA.desdeDia()}`;
            params.push(filters.desde);
        }
        if (filters.hasta) {
            where += ` AND f.fecha < ${SQL_COLOMBIA.hastaDia()}`;
            params.push(filters.hasta);
        }
        if (filters.formaPago) {
            where += ' AND f.forma_pago = ?';
            params.push(filters.formaPago);
        }
        if (filters.q) {
            // Mismo "#" que muestra la tabla: numero, o el id si la factura no tiene.
            where += ' AND (CAST(COALESCE(f.numero, f.id) AS CHAR) LIKE ? OR c.nombre LIKE ?)';
            const term = `%${filters.q}%`;
            params.push(term, term);
        }

        const from = `
            FROM facturas f
            JOIN tenants t ON f.tenant_id = t.id
            LEFT JOIN clientes c ON f.cliente_id = c.id AND c.tenant_id = f.tenant_id`;

        const [[resumen]] = await db.query(
            `SELECT COUNT(*) AS total, COALESCE(SUM(f.total), 0) AS monto_total ${from} ${where}`,
            params
        );

        const offset = (Math.max(page, 1) - 1) * limit;
        const [ventas] = await db.query(
            `SELECT f.id, f.numero, DATE_FORMAT(f.fecha, '%Y-%m-%d %H:%i:%s') AS fecha,
                    f.forma_pago, f.total, c.nombre AS cliente_nombre, t.nombre AS tenant_nombre
             ${from} ${where}
             ORDER BY f.fecha DESC, f.id DESC
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        return { ventas, total: Number(resumen.total) || 0, montoTotal: Number(resumen.monto_total) || 0 };
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
                f.monto_efectivo,
                f.monto_transferencia,
                f.monto_bono,
                f.evento_id,
                e.nombre AS evento_nombre,
                t.nombre AS tenant_nombre,
                CASE WHEN f.evento_id IS NOT NULL THEN CONCAT('Evento: ', e.nombre) ELSE 'Venta diaria' END AS tipo_venta
            FROM facturas f
            JOIN tenants t ON f.tenant_id = t.id
            LEFT JOIN clientes c ON f.cliente_id = c.id AND c.tenant_id = f.tenant_id
            LEFT JOIN eventos e ON f.evento_id = e.id AND e.tenant_id = f.tenant_id
            WHERE 1=1
        `;
        const params = [];
        if (tenantId && tenantId !== 'all') {
            query += ` AND f.tenant_id = ?`;
            params.push(tenantId);
        }

        if (filters.desde) {
            // Sargable (sin función sobre f.fecha, usa el índice). El día del filtro es
            // un día Colombia y f.fecha está en UTC: se convierte el límite, no la columna.
            // Sin esto, lo vendido después de las 7 p. m. caía en el día siguiente.
            query += ` AND f.fecha >= ${SQL_COLOMBIA.desdeDia()}`;
            params.push(filters.desde);
        }

        if (filters.hasta) {
            // Igual que arriba: rango sargable en vez de DATE(f.fecha) <= ?. Incluye
            // todo el día "hasta" comparando contra el inicio del día siguiente.
            query += ` AND f.fecha < ${SQL_COLOMBIA.hastaDia()}`;
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
        const [mesas] = await db.query(
            `
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
        `,
            [tenantId]
        );
        return mesas;
    }
}

module.exports = VentaRepository;
