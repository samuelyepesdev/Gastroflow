/**
 * RecetaRepository - Data access for recipes and recipe ingredients
 * Related to: CosteoService, routes/costeo.js
 */

const db = require('../../config/database');

const RECETA_COLUMNS =
    'r.id, r.tenant_id, r.producto_id, r.nombre_receta, r.porciones, r.costos_adicionales, r.created_at, r.updated_at';

class RecetaRepository {
    static async findAll(tenantId, filters = {}) {
        let sql = `
            SELECT ${RECETA_COLUMNS}, p.nombre AS producto_nombre, p.codigo AS producto_codigo, p.precio_unidad AS precio_venta_actual
            FROM recetas r
            INNER JOIN productos p ON p.id = r.producto_id AND p.tenant_id = r.tenant_id
            WHERE r.tenant_id = ?
        `;
        const params = [tenantId];
        if (filters.parametro_id) {
            sql += ` AND EXISTS (
                SELECT 1 FROM producto_parametro pp
                WHERE pp.producto_id = r.producto_id AND pp.parametro_id = ?
            )`;
            params.push(parseInt(filters.parametro_id, 10));
        }
        if (filters.tema_id && !filters.parametro_id) {
            sql += ` AND EXISTS (
                SELECT 1 FROM tema_parametro tp
                INNER JOIN producto_parametro pp ON pp.parametro_id = tp.parametro_id AND pp.producto_id = r.producto_id
                WHERE tp.tema_id = ? AND tp.status = 1
            )`;
            params.push(parseInt(filters.tema_id, 10));
        }
        if (filters.q && filters.q.trim()) {
            sql += ' AND (r.nombre_receta LIKE ? OR p.nombre LIKE ? OR p.codigo LIKE ?)';
            const term = '%' + filters.q.trim() + '%';
            params.push(term, term, term);
        }
        sql += ' ORDER BY r.nombre_receta';
        const [rows] = await db.query(sql, params);
        return rows;
    }

    static async findById(id, tenantId) {
        const [rows] = await db.query(
            `
            SELECT ${RECETA_COLUMNS}, p.nombre AS producto_nombre, p.codigo AS producto_codigo, p.precio_unidad AS precio_venta_actual
            FROM recetas r
            INNER JOIN productos p ON p.id = r.producto_id
            WHERE r.id = ? AND r.tenant_id = ?
        `,
            [id, tenantId]
        );
        const row = rows[0] || null;
        if (row && row.costos_adicionales) {
            try {
                row.costos_adicionales =
                    typeof row.costos_adicionales === 'string'
                        ? JSON.parse(row.costos_adicionales)
                        : row.costos_adicionales;
            } catch (_) {
                row.costos_adicionales = null;
            }
        }
        return row;
    }

    static async findByProductoId(productoId, tenantId) {
        const [rows] = await db.query(
            'SELECT id, tenant_id, producto_id, nombre_receta, porciones, costos_adicionales, created_at, updated_at ' +
                'FROM recetas WHERE producto_id = ? AND tenant_id = ?',
            [productoId, tenantId]
        );
        return rows[0] || null;
    }

    static async create(tenantId, data) {
        const { producto_id, nombre_receta, porciones, costos_adicionales } = data;
        const costosJson =
            costos_adicionales !== null && costos_adicionales !== undefined ? JSON.stringify(costos_adicionales) : null;
        const [result] = await db.query(
            'INSERT INTO recetas (tenant_id, producto_id, nombre_receta, porciones, costos_adicionales) VALUES (?, ?, ?, ?, ?)',
            [tenantId, producto_id, nombre_receta, parseFloat(porciones) || 1, costosJson]
        );
        return result.insertId;
    }

    static async update(id, tenantId, data) {
        const { nombre_receta, porciones, costos_adicionales } = data;
        const updates = ['nombre_receta = ?', 'porciones = ?'];
        const params = [nombre_receta ?? '', parseFloat(porciones) || 1];
        if (costos_adicionales !== undefined) {
            updates.push('costos_adicionales = ?');
            params.push(
                costos_adicionales !== null && costos_adicionales !== undefined
                    ? JSON.stringify(costos_adicionales)
                    : null
            );
        }
        params.push(id, tenantId);
        const [result] = await db.query(
            `UPDATE recetas SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`,
            params
        );
        return result;
    }

    static async delete(id, tenantId) {
        const [result] = await db.query('DELETE FROM recetas WHERE id = ? AND tenant_id = ?', [id, tenantId]);
        return result;
    }

    static async getIngredientes(recetaId) {
        const [rows] = await db.query(
            `
            SELECT ri.*, i.nombre AS insumo_nombre, i.codigo AS insumo_codigo, i.unidad_compra, i.unidad_base,
                   i.cantidad_compra, i.precio_compra, i.costo_promedio, i.rendimiento_pct, i.stock_actual
            FROM receta_ingredientes ri
            INNER JOIN insumos i ON i.id = ri.insumo_id
            WHERE ri.receta_id = ?
            ORDER BY ri.id
        `,
            [recetaId]
        );
        return rows;
    }

    static async setIngredientes(recetaId, items) {
        const conn = await db.getConnection();
        try {
            await conn.query('DELETE FROM receta_ingredientes WHERE receta_id = ?', [recetaId]);
            if (items && items.length > 0) {
                for (const it of items) {
                    await conn.query(
                        'INSERT INTO receta_ingredientes (receta_id, insumo_id, cantidad, unidad) VALUES (?, ?, ?, ?)',
                        [recetaId, it.insumo_id, parseFloat(it.cantidad) || 0, it.unidad || 'g']
                    );
                }
            }
        } finally {
            conn.release();
        }
    }
}

module.exports = RecetaRepository;
