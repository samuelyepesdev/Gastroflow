const db = require('../../config/database');

class POSRepository {
    static async getProductosActivos(tenantId) {
        const [rows] = await db.query(
            `SELECT p.id, p.nombre, p.precio_unidad, p.codigo, p.es_favorito,
                    c.id AS categoria_id, c.nombre AS categoria_nombre
             FROM productos p
             LEFT JOIN categorias c ON p.categoria_id = c.id
             WHERE p.tenant_id = ? AND p.activo = 1
             ORDER BY p.es_favorito DESC, c.nombre, p.nombre`,
            [tenantId]
        );
        return rows;
    }

    static async getBorradores(tenantId, usuarioId) {
        const [rows] = await db.query(
            `SELECT id, cliente_id, nombre_cliente, items, total, notas, created_at
             FROM pos_borradores
             WHERE tenant_id = ? AND usuario_id = ?
             ORDER BY updated_at DESC`,
            [tenantId, usuarioId]
        );
        return rows.map(r => ({
            ...r,
            items: typeof r.items === 'string' ? JSON.parse(r.items) : r.items
        }));
    }

    static async createBorrador(tenantId, usuarioId, { cliente_id, nombre_cliente, items, total, notas }) {
        const [result] = await db.query(
            `INSERT INTO pos_borradores (tenant_id, usuario_id, cliente_id, nombre_cliente, items, total, notas)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                tenantId,
                usuarioId,
                cliente_id || null,
                nombre_cliente || null,
                JSON.stringify(items),
                total || 0,
                notas || null
            ]
        );
        return result.insertId;
    }

    static async deleteBorrador(id, tenantId) {
        const [result] = await db.query(`DELETE FROM pos_borradores WHERE id = ? AND tenant_id = ?`, [id, tenantId]);
        return result.affectedRows > 0;
    }

    static async getStatsHoy(tenantId) {
        const [rows] = await db.query(
            `SELECT COUNT(*) AS num_ordenes, COALESCE(SUM(total), 0) AS total_hoy
             FROM facturas
             WHERE tenant_id = ? AND DATE(fecha) = CURDATE()`,
            [tenantId]
        );
        return rows[0] || { num_ordenes: 0, total_hoy: 0 };
    }

    static async findOrCreateCliente(tenantId, nombre) {
        const [existing] = await db.query(
            'SELECT id FROM clientes WHERE tenant_id = ? AND LOWER(nombre) = LOWER(?) LIMIT 1',
            [tenantId, nombre.trim()]
        );
        if (existing.length) {
            return existing[0].id;
        }
        const [result] = await db.query('INSERT INTO clientes (tenant_id, nombre) VALUES (?, ?)', [
            tenantId,
            nombre.trim()
        ]);
        return result.insertId;
    }
}

module.exports = POSRepository;
