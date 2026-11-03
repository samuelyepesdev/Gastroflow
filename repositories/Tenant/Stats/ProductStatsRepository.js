const db = require('../../../config/database');
const { rangoUtcColombia } = require('../../../utils/dateHelpers');

class ProductStatsRepository {
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
            WHERE f.tenant_id = ? AND f.evento_aparte = 0 AND p.activo = 1
        `;
        const params = [tenantId];

        if (filters.desde && filters.hasta) {
            const { utcDesde, utcHasta } = rangoUtcColombia(filters.desde, filters.hasta);
            query += ' AND f.fecha BETWEEN ? AND ?';
            params.push(utcDesde, utcHasta);
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
     * Listado completo del catálogo (no solo lo vendido), con filtro opcional de
     * categoría además del rango de fechas. Usado por el módulo de Clasificación
     * -- a diferencia de getTopProducts (widget del dashboard, solo productos con
     * ventas), aquí SIEMPRE aparecen todos los productos activos del tenant, con
     * $0 / 0 unidades los que no se han vendido, para poder detectar qué no se mueve.
     * Las ventas se agregan en una subconsulta aparte (en vez de LEFT JOIN directo a
     * detalle_factura/facturas) porque filtrar por fecha en el WHERE de un LEFT JOIN
     * lo convierte en INNER JOIN y los productos sin ventas en ese rango desaparecerían.
     */
    static async getRankingProductos(tenantId, filters = {}) {
        let ventasSubquery = `
            SELECT df.producto_id,
                   SUM(df.cantidad) AS total_cantidad,
                   SUM(df.subtotal) AS total_ventas,
                   COUNT(DISTINCT df.factura_id) AS facturas_count
            FROM detalle_factura df
            INNER JOIN facturas f ON df.factura_id = f.id
            WHERE f.tenant_id = ? AND f.evento_aparte = 0
        `;
        const params = [tenantId];

        if (filters.desde && filters.hasta) {
            const { utcDesde, utcHasta } = rangoUtcColombia(filters.desde, filters.hasta);
            ventasSubquery += ' AND f.fecha BETWEEN ? AND ?';
            params.push(utcDesde, utcHasta);
        }

        ventasSubquery += ' GROUP BY df.producto_id';

        let query = `
            SELECT
                p.id,
                p.nombre,
                p.codigo,
                c.id AS categoria_id,
                c.nombre AS categoria_nombre,
                COALESCE(v.total_cantidad, 0) AS total_cantidad,
                COALESCE(v.total_ventas, 0) AS total_ventas,
                COALESCE(v.facturas_count, 0) AS facturas_count
            FROM productos p
            LEFT JOIN categorias c ON p.categoria_id = c.id
            LEFT JOIN (${ventasSubquery}) v ON v.producto_id = p.id
            WHERE p.tenant_id = ? AND p.activo = 1
        `;
        params.push(tenantId);

        if (filters.categoria_id) {
            query += ' AND c.id = ?';
            params.push(filters.categoria_id);
        }

        query += `
            ORDER BY total_ventas DESC, p.nombre ASC
            LIMIT 500
        `;

        const [result] = await db.query(query, params);
        return result.map(row => ({
            id: row.id,
            nombre: row.nombre,
            codigo: row.codigo,
            categoria_id: row.categoria_id,
            categoria_nombre: row.categoria_nombre || 'Sin categoría',
            total_cantidad: parseFloat(row.total_cantidad || 0),
            total_ventas: parseFloat(row.total_ventas || 0),
            facturas_count: parseInt(row.facturas_count || 0)
        }));
    }

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
            WHERE f.tenant_id = ? AND f.evento_aparte = 0 AND p.activo = 1
        `;
        const params = [tenantId];

        if (filters.desde && filters.hasta) {
            const { utcDesde, utcHasta } = rangoUtcColombia(filters.desde, filters.hasta);
            query += ' AND f.fecha BETWEEN ? AND ?';
            params.push(utcDesde, utcHasta);
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
            WHERE f.tenant_id = ? AND f.evento_aparte = 0 AND p.activo = 1
        `;
        const params = [tenantId];

        if (filters.desde && filters.hasta) {
            const { utcDesde, utcHasta } = rangoUtcColombia(filters.desde, filters.hasta);
            query += ' AND f.fecha BETWEEN ? AND ?';
            params.push(utcDesde, utcHasta);
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
}

module.exports = ProductStatsRepository;
