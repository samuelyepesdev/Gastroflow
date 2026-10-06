/**
 * ComboRepository - Combos fijos (productos con es_combo = 1 + combo_componentes).
 * Related to: services/Tenant/ComboService.js, services/Tenant/InventarioService.js
 */

const db = require('../../config/database');

class ComboRepository {
    /** Combos activos del tenant con # de componentes y suma de precios individuales. */
    static async findAll(tenantId) {
        const [rows] = await db.query(
            `SELECT p.id, p.codigo, p.nombre, p.precio_unidad, p.categoria_id, c.nombre AS categoria_nombre,
                    COUNT(cc.producto_id) AS componentes_count,
                    COALESCE(SUM(cc.cantidad * comp.precio_unidad), 0) AS precio_individual
             FROM productos p
             LEFT JOIN categorias c ON c.id = p.categoria_id
             LEFT JOIN combo_componentes cc ON cc.combo_id = p.id
             LEFT JOIN productos comp ON comp.id = cc.producto_id
             WHERE p.tenant_id = ? AND p.es_combo = 1 AND p.activo = 1
             GROUP BY p.id
             ORDER BY p.nombre`,
            [tenantId]
        );
        if (rows.length === 0) {
            return rows;
        }

        // Qué incluye cada combo (para mostrarlo en el listado sin abrir cada uno).
        const [componentes] = await db.query(
            `SELECT cc.combo_id, cc.cantidad, p.nombre
             FROM combo_componentes cc
             JOIN productos p ON p.id = cc.producto_id
             WHERE cc.combo_id IN (?)
             ORDER BY p.nombre`,
            [rows.map(r => r.id)]
        );
        const porCombo = new Map();
        for (const c of componentes) {
            if (!porCombo.has(c.combo_id)) {
                porCombo.set(c.combo_id, []);
            }
            porCombo.get(c.combo_id).push({ nombre: c.nombre, cantidad: Number(c.cantidad) });
        }
        return rows.map(r => ({ ...r, componentes: porCombo.get(r.id) || [] }));
    }

    static async findById(id, tenantId) {
        const [rows] = await db.query(
            'SELECT * FROM productos WHERE id = ? AND tenant_id = ? AND es_combo = 1 AND activo = 1',
            [id, tenantId]
        );
        return rows[0] || null;
    }

    /** Componentes de un combo ([] si el producto no es combo). */
    static async getComponentes(comboId, tenantId) {
        const [rows] = await db.query(
            `SELECT cc.producto_id, cc.cantidad, p.nombre, p.precio_unidad
             FROM combo_componentes cc
             JOIN productos p ON p.id = cc.producto_id AND p.tenant_id = ?
             WHERE cc.combo_id = ?
             ORDER BY p.nombre`,
            [tenantId, comboId]
        );
        return rows;
    }

    /** Marca el producto como combo y reemplaza sus componentes. */
    static async setComponentes(comboId, tenantId, componentes) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            await connection.query('UPDATE productos SET es_combo = 1 WHERE id = ? AND tenant_id = ?', [
                comboId,
                tenantId
            ]);
            await connection.query('DELETE FROM combo_componentes WHERE combo_id = ?', [comboId]);
            if (componentes.length > 0) {
                await connection.query('INSERT INTO combo_componentes (combo_id, producto_id, cantidad) VALUES ?', [
                    componentes.map(c => [comboId, c.producto_id, c.cantidad])
                ]);
            }
            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    /** Ids (del tenant, activos y que NO sean combos) de una lista -- solo esos pueden ser componentes. */
    static async findProductosSimples(ids, tenantId) {
        if (ids.length === 0) {
            return [];
        }
        const [rows] = await db.query(
            'SELECT id FROM productos WHERE tenant_id = ? AND activo = 1 AND es_combo = 0 AND id IN (?)',
            [tenantId, ids]
        );
        return rows.map(r => r.id);
    }
}

module.exports = ComboRepository;
