/**
 * EventoRepository - Data access for events (eventos)
 * Events allow tagging sales so they don't affect predictive analytics.
 */

const db = require('../../config/database');
const { SQL_COLOMBIA } = require('../../utils/dateHelpers');

class EventoRepository {
    static async findAllByTenant(tenantId, filters = {}) {
        let query = `
            SELECT id, tenant_id, nombre, fecha_inicio, fecha_fin, descripcion, activo, tipo, incluir_en_ventas, created_at
            FROM eventos
            WHERE tenant_id = ?
        `;
        const params = [tenantId];
        if (filters.activo !== undefined) {
            query += ' AND activo = ?';
            params.push(filters.activo ? 1 : 0);
        }
        if (filters.mes && filters.anio) {
            query += ' AND MONTH(fecha_inicio) = ? AND YEAR(fecha_inicio) = ?';
            params.push(filters.mes, filters.anio);
        }
        query += ' ORDER BY fecha_inicio DESC, id DESC';
        const [rows] = await db.query(query, params);
        return rows;
    }

    static async findById(id, tenantId) {
        const [rows] = await db.query('SELECT * FROM eventos WHERE id = ? AND tenant_id = ?', [id, tenantId]);
        return rows[0] || null;
    }

    static async findActiveByDate(tenantId, date) {
        const [rows] = await db.query(
            `SELECT id, nombre FROM eventos 
             WHERE tenant_id = ? AND activo = TRUE 
             AND ? BETWEEN fecha_inicio AND fecha_fin
             ORDER BY fecha_inicio DESC LIMIT 1`,
            [tenantId, date]
        );
        return rows[0] || null;
    }

    static async create(tenantId, data) {
        const { nombre, fecha_inicio, fecha_fin, descripcion, incluir_en_ventas } = data;
        const [result] = await db.query(
            `INSERT INTO eventos (tenant_id, nombre, fecha_inicio, fecha_fin, descripcion, activo, incluir_en_ventas)
             VALUES (?, ?, ?, ?, ?, TRUE, ?)`,
            [tenantId, nombre, fecha_inicio, fecha_fin, descripcion || null, incluir_en_ventas ? 1 : 0]
        );
        return result.insertId;
    }

    /**
     * Actualiza el evento. Si cambia `incluir_en_ventas`, sus facturas se re-marcan en la misma transacción
     * (facturas.evento_aparte) para que las estadísticas cuenten —o dejen de contar— sus ventas como normales,
     * incluidas las ya registradas.
     */
    static async update(id, tenantId, data) {
        const { nombre, fecha_inicio, fecha_fin, descripcion, activo, incluir_en_ventas } = data;
        const updates = [
            'nombre = ?',
            'fecha_inicio = ?',
            'fecha_fin = ?',
            'descripcion = ?',
            'activo = COALESCE(?, activo)'
        ];
        const params = [nombre, fecha_inicio, fecha_fin, descripcion || null, activo];
        const cambiaInclusion = incluir_en_ventas !== undefined && incluir_en_ventas !== null;
        if (cambiaInclusion) {
            updates.push('incluir_en_ventas = ?');
            params.push(incluir_en_ventas ? 1 : 0);
        }
        params.push(id, tenantId);

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            await connection.query(`UPDATE eventos SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`, params);
            if (cambiaInclusion) {
                await connection.query('UPDATE facturas SET evento_aparte = ? WHERE evento_id = ? AND tenant_id = ?', [
                    incluir_en_ventas ? 0 : 1,
                    id,
                    tenantId
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

    static async delete(id, tenantId) {
        const [result] = await db.query('DELETE FROM eventos WHERE id = ? AND tenant_id = ?', [id, tenantId]);
        return result.affectedRows > 0;
    }

    /** Cantidad de facturas asociadas a un evento. */
    static async countVentas(id, tenantId) {
        const [rows] = await db.query('SELECT COUNT(*) AS total FROM facturas WHERE evento_id = ? AND tenant_id = ?', [
            id,
            tenantId
        ]);
        return parseInt(rows[0]?.total || 0);
    }

    /** Count events in date range for tenant */
    static async countInRange(tenantId, desde, hasta) {
        const [rows] = await db.query(
            `SELECT COUNT(*) AS total FROM eventos 
             WHERE tenant_id = ? AND fecha_inicio >= ? AND fecha_fin <= ?`,
            [tenantId, desde, hasta]
        );
        return parseInt(rows[0]?.total || 0);
    }

    /** Ventas resumen por evento: cantidad y total por evento_id (solo facturas con evento_id) */
    static async getVentasResumenPorEvento(tenantId) {
        const [rows] = await db.query(
            `SELECT evento_id, COUNT(*) AS cantidad_ventas, COALESCE(SUM(total), 0) AS total_ventas
             FROM facturas
             WHERE tenant_id = ? AND evento_id IS NOT NULL
             GROUP BY evento_id`,
            [tenantId]
        );
        return rows;
    }

    /**
     * Obtiene los eventos que están en curso hoy, o que comenzarán en los próximos "dias" días.
     */
    static async getProximosEventos(tenantId, dias = 8) {
        const [rows] = await db.query(
            `SELECT id, nombre, fecha_inicio, fecha_fin, descripcion, tipo 
             FROM eventos 
             WHERE tenant_id = ? AND activo = 1 
             AND (fecha_inicio <= DATE_ADD(${SQL_COLOMBIA.hoy}, INTERVAL ? DAY) AND fecha_fin >= ${SQL_COLOMBIA.hoy})
             ORDER BY fecha_inicio ASC`,
            [tenantId, dias]
        );
        return rows;
    }
}

module.exports = EventoRepository;
