/**
 * ComboArmableRepository - Catálogo de combos armables (combos + combo_grupos + combo_opciones).
 * Sustituirá a ComboRepository (combos como productos es_combo) cuando la venta migre al modelo nuevo.
 * Related to: services/Tenant/ComboArmableService.js, database/migrations/111_combos_armables.sql
 */

const db = require('../../config/database');

class ComboArmableRepository {
    /** Combos del tenant con # de grupos, para el listado. */
    static async findAll(tenantId, { soloActivos = true } = {}) {
        const [rows] = await db.query(
            `SELECT cb.*, e.nombre AS estacion_nombre, COUNT(g.id) AS grupos_count
             FROM combos cb
             LEFT JOIN estaciones e ON e.id = cb.estacion_id
             LEFT JOIN combo_grupos g ON g.combo_id = cb.id
             WHERE cb.tenant_id = ? ${soloActivos ? 'AND cb.activo = 1' : ''}
             GROUP BY cb.id
             ORDER BY cb.orden, cb.nombre`,
            [tenantId]
        );
        return rows;
    }

    static async findById(id, tenantId) {
        const [rows] = await db.query('SELECT * FROM combos WHERE id = ? AND tenant_id = ? AND activo = 1', [
            id,
            tenantId
        ]);
        return rows[0] || null;
    }

    /** Grupos del combo con sus opciones (nombre y estado del producto incluidos). */
    static async getGrupos(comboId) {
        return this.getGruposPorCombos([comboId]);
    }

    /** Igual que getGrupos para varios combos a la vez (cada grupo trae su combo_id). */
    static async getGruposPorCombos(comboIds) {
        if (comboIds.length === 0) {
            return [];
        }
        const [grupos] = await db.query('SELECT * FROM combo_grupos WHERE combo_id IN (?) ORDER BY orden, id', [
            comboIds
        ]);
        if (grupos.length === 0) {
            return [];
        }
        const [opciones] = await db.query(
            `SELECT o.*, p.nombre AS producto_nombre, p.precio_unidad AS producto_precio,
                    p.activo AS producto_activo
             FROM combo_opciones o
             JOIN productos p ON p.id = o.producto_id
             WHERE o.grupo_id IN (?)
             ORDER BY o.orden, o.id`,
            [grupos.map(g => g.id)]
        );
        return grupos.map(g => ({ ...g, opciones: opciones.filter(o => o.grupo_id === g.id) }));
    }

    static async create(tenantId, data, grupos) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            const [result] = await connection.query(
                `INSERT INTO combos (tenant_id, nombre, descripcion, imagen_url, precio_base, tributo,
                                     tasa_impuesto, estacion_id, orden)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    tenantId,
                    data.nombre,
                    data.descripcion,
                    data.imagen_url,
                    data.precio_base,
                    data.tributo,
                    data.tasa_impuesto,
                    data.estacion_id,
                    data.orden
                ]
            );
            await this._insertarGrupos(connection, result.insertId, grupos);
            await connection.commit();
            return result.insertId;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    /** Actualiza los datos del combo y reemplaza por completo su estructura de grupos/opciones. */
    static async replace(id, tenantId, data, grupos) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            await connection.query(
                `UPDATE combos SET nombre = ?, descripcion = ?, imagen_url = ?, precio_base = ?, tributo = ?,
                                   tasa_impuesto = ?, estacion_id = ?, orden = ?
                 WHERE id = ? AND tenant_id = ?`,
                [
                    data.nombre,
                    data.descripcion,
                    data.imagen_url,
                    data.precio_base,
                    data.tributo,
                    data.tasa_impuesto,
                    data.estacion_id,
                    data.orden,
                    id,
                    tenantId
                ]
            );
            // Las selecciones ya vendidas guardan snapshot: su FK a la opción pasa a NULL.
            await connection.query('DELETE FROM combo_grupos WHERE combo_id = ?', [id]);
            await this._insertarGrupos(connection, id, grupos);
            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    /** Borrado lógico: pedidos y facturas históricas siguen apuntando al combo. */
    static async softDelete(id, tenantId) {
        const [result] = await db.query('UPDATE combos SET activo = 0 WHERE id = ? AND tenant_id = ?', [id, tenantId]);
        return result.affectedRows > 0;
    }

    /** Ids (del tenant, activos y que no sean combos legados) de una lista: solo esos pueden ser opciones. */
    static async findProductosElegibles(ids, tenantId) {
        if (ids.length === 0) {
            return [];
        }
        const [rows] = await db.query(
            'SELECT id FROM productos WHERE tenant_id = ? AND activo = 1 AND es_combo = 0 AND id IN (?)',
            [tenantId, ids]
        );
        return rows.map(r => r.id);
    }

    /** Estación activa del tenant, o null si no existe / es de otro tenant. */
    static async findEstacion(estacionId, tenantId) {
        const [rows] = await db.query('SELECT id FROM estaciones WHERE id = ? AND tenant_id = ? AND activa = 1', [
            estacionId,
            tenantId
        ]);
        return rows[0] || null;
    }

    static async _insertarGrupos(connection, comboId, grupos) {
        for (const [i, grupo] of grupos.entries()) {
            const [res] = await connection.query(
                'INSERT INTO combo_grupos (combo_id, nombre, minimo, maximo, orden) VALUES (?, ?, ?, ?, ?)',
                [comboId, grupo.nombre, grupo.minimo, grupo.maximo, i]
            );
            await connection.query(
                `INSERT INTO combo_opciones (grupo_id, producto_id, cantidad, recargo, es_default, orden)
                 VALUES ?`,
                [
                    grupo.opciones.map((o, j) => [
                        res.insertId,
                        o.producto_id,
                        o.cantidad,
                        o.recargo,
                        o.es_default ? 1 : 0,
                        j
                    ])
                ]
            );
        }
    }
}

module.exports = ComboArmableRepository;
