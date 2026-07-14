/**
 * InsumoRepository - Data access for ingredients (materia prima)
 * Related to: CosteoService, routes/costeo.js
 */

const db = require('../../config/database');

class InsumoRepository {
    static async findAll(tenantId, filters = {}) {
        let sql = `SELECT i.*, 
                          pc.name AS categoria_nombre, 
                          pu.name AS unidad_medida_nombre,
                          prov.nombre AS proveedor_nombre 
                   FROM insumos i
                   LEFT JOIN parametros pc ON i.categoria_id = pc.id
                   LEFT JOIN parametros pu ON i.unidad_medida_id = pu.id
                   LEFT JOIN proveedores prov ON i.proveedor_id = prov.id
                   WHERE i.tenant_id = ?`;
        const params = [tenantId];
        if (filters.q && filters.q.trim()) {
            sql += ' AND (i.codigo LIKE ? OR i.nombre LIKE ?)';
            const term = '%' + filters.q.trim() + '%';
            params.push(term, term);
        }
        if (filters.unidad && filters.unidad.trim()) {
            sql += ' AND i.unidad_compra = ?';
            params.push(filters.unidad.trim());
        }
        sql += ' ORDER BY i.nombre';
        const [rows] = await db.query(sql, params);
        return rows;
    }

    static async findById(id, tenantId) {
        const [rows] = await db.query(
            `SELECT i.*, 
                    pc.name AS categoria_nombre, 
                    pu.name AS unidad_medida_nombre,
                    prov.nombre AS proveedor_nombre 
             FROM insumos i
             LEFT JOIN parametros pc ON i.categoria_id = pc.id
             LEFT JOIN parametros pu ON i.unidad_medida_id = pu.id
             LEFT JOIN proveedores prov ON i.proveedor_id = prov.id
             WHERE i.id = ? AND i.tenant_id = ?`,
            [id, tenantId]
        );
        return rows[0] || null;
    }

    /**
     * Batch lookup por ids (evita N+1 en chequeo/descuento de stock por receta).
     * Solo trae las columnas usadas para esos cálculos, sin los joins de display.
     * @param {number[]} ids
     * @param {number} tenantId
     * @returns {Promise<Map<number, Object>>} insumo_id -> insumo
     */
    static async findByIds(ids, tenantId) {
        const uniqueIds = [...new Set((ids || []).filter(id => id !== null && id !== undefined))];
        if (uniqueIds.length === 0) {
            return new Map();
        }
        const placeholders = uniqueIds.map(() => '?').join(',');
        const [rows] = await db.query(
            `SELECT i.id, i.nombre, i.unidad_base, i.stock_actual, i.costo_promedio, pc.name AS categoria_nombre
             FROM insumos i
             LEFT JOIN parametros pc ON i.categoria_id = pc.id
             WHERE i.tenant_id = ? AND i.id IN (${placeholders})`,
            [tenantId, ...uniqueIds]
        );
        return new Map(rows.map(r => [r.id, r]));
    }

    static async findByCodigo(codigo, tenantId, excludeId = null) {
        let sql = 'SELECT id FROM insumos WHERE tenant_id = ? AND codigo = ?';
        const params = [tenantId, codigo];
        if (excludeId) {
            sql += ' AND id != ?';
            params.push(excludeId);
        }
        const [rows] = await db.query(sql, params);
        return rows[0] || null;
    }

    static async create(tenantId, data) {
        const {
            codigo,
            nombre,
            unidad_compra,
            cantidad_compra,
            precio_compra,
            unidad_base,
            stock_minimo,
            categoria_id,
            unidad_medida_id,
            proveedor_id,
            rendimiento_pct
        } = data;
        const [result] = await db.query(
            `INSERT INTO insumos (tenant_id, codigo, nombre, unidad_compra, cantidad_compra, precio_compra, precio_venta, unidad_base, rendimiento_pct, stock_minimo, categoria_id, unidad_medida_id, proveedor_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                tenantId,
                codigo,
                nombre,
                unidad_compra || 'UND',
                parseFloat(cantidad_compra) || 1,
                parseFloat(precio_compra) || 0,
                parseFloat(data.precio_venta) || 0,
                (unidad_base && String(unidad_base).trim()) || 'g',
                rendimiento_pct !== undefined && rendimiento_pct !== null ? parseFloat(rendimiento_pct) : 100,
                parseFloat(stock_minimo) || 0,
                categoria_id || null,
                unidad_medida_id || null,
                proveedor_id || null
            ]
        );
        return result.insertId;
    }

    static async update(id, tenantId, data) {
        const fields = [];
        const params = [];
        const allowed = [
            'codigo',
            'nombre',
            'unidad_compra',
            'cantidad_compra',
            'precio_compra',
            'precio_venta',
            'unidad_base',
            'rendimiento_pct',
            'stock_minimo',
            'categoria_id',
            'unidad_medida_id',
            'proveedor_id'
        ];
        for (const key of allowed) {
            if (data[key] !== undefined) {
                if (
                    key === 'cantidad_compra' ||
                    key === 'precio_compra' ||
                    key === 'precio_venta' ||
                    key === 'stock_minimo' ||
                    key === 'rendimiento_pct'
                ) {
                    fields.push(`${key} = ?`);
                    params.push(parseFloat(data[key]));
                } else {
                    fields.push(`${key} = ?`);
                    params.push(key === 'unidad_base' ? data[key] || 'g' : data[key]);
                }
            }
        }
        if (fields.length === 0) {
            return null;
        }
        params.push(id, tenantId);
        const [result] = await db.query(
            `UPDATE insumos SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`,
            params
        );
        return result;
    }

    static async updateStockAndCosto(id, tenantId, stock_actual, costo_promedio) {
        const [result] = await db.query(
            'UPDATE insumos SET stock_actual = ?, costo_promedio = ? WHERE id = ? AND tenant_id = ?',
            [
                parseFloat(stock_actual),
                costo_promedio !== null && costo_promedio !== undefined ? parseFloat(costo_promedio) : null,
                id,
                tenantId
            ]
        );
        return result;
    }

    static async delete(id, tenantId) {
        const [result] = await db.query('DELETE FROM insumos WHERE id = ? AND tenant_id = ?', [id, tenantId]);
        return result;
    }
}

module.exports = InsumoRepository;
