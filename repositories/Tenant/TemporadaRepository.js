/**
 * TemporadaRepository - Vigencia por fechas de productos/combos (menú de temporada).
 * El catálogo (Mesas, POS, QR) no se toca: esta capa solo mueve `productos.disponible`.
 */
const db = require('../../config/database');

const ESTADO_CALCULADO = `IF((v.desde IS NULL OR v.desde <= ?) AND (v.hasta IS NULL OR v.hasta >= ?), 1, 0)`;

class TemporadaRepository {
    /** Productos del tenant que existen y están activos (para validar ids antes de guardar). */
    static async findProductosActivos(tenantId, ids) {
        if (!ids.length) {
            return [];
        }
        const [rows] = await db.query('SELECT id FROM productos WHERE tenant_id = ? AND activo = 1 AND id IN (?)', [
            tenantId,
            ids
        ]);
        return rows.map(r => r.id);
    }

    /** Crea o reemplaza la vigencia; estado_aplicado = NULL fuerza a que se aplique en la siguiente pasada. */
    static async upsert(tenantId, productoIds, desde, hasta) {
        if (!productoIds.length) {
            return;
        }
        await db.query(
            `INSERT INTO producto_vigencia (tenant_id, producto_id, desde, hasta, estado_aplicado) VALUES ?
             ON DUPLICATE KEY UPDATE desde = VALUES(desde), hasta = VALUES(hasta), estado_aplicado = NULL`,
            [productoIds.map(id => [tenantId, id, desde, hasta, null])]
        );
    }

    static async delete(tenantId, productoId) {
        const [result] = await db.query('DELETE FROM producto_vigencia WHERE tenant_id = ? AND producto_id = ?', [
            tenantId,
            productoId
        ]);
        return result.affectedRows;
    }

    static async findAllConProducto(tenantId) {
        const [rows] = await db.query(
            `SELECT v.producto_id, p.nombre, p.es_combo, p.disponible,
                    DATE_FORMAT(v.desde, '%Y-%m-%d') AS desde, DATE_FORMAT(v.hasta, '%Y-%m-%d') AS hasta
             FROM producto_vigencia v
             JOIN productos p ON p.id = v.producto_id AND p.tenant_id = v.tenant_id
             WHERE v.tenant_id = ? AND p.activo = 1
             ORDER BY v.desde IS NULL, v.desde, p.nombre`,
            [tenantId]
        );
        return rows;
    }

    /**
     * Pone `disponible` según la ventana de cada producto, solo donde el estado calculado cambió desde la última
     * vez. `tenantId` opcional: sin él recorre todos los restaurantes (proceso diario).
     * @returns {Promise<number>} filas de productos modificadas
     */
    static async aplicarVigencias(hoy, tenantId = null) {
        const [result] = await db.query(
            `UPDATE productos p
             JOIN producto_vigencia v ON v.producto_id = p.id AND v.tenant_id = p.tenant_id
             SET p.disponible = ${ESTADO_CALCULADO}, v.estado_aplicado = ${ESTADO_CALCULADO}
             WHERE p.activo = 1
               AND (v.estado_aplicado IS NULL OR v.estado_aplicado <> ${ESTADO_CALCULADO})
               ${tenantId ? 'AND p.tenant_id = ?' : ''}`,
            [hoy, hoy, hoy, hoy, hoy, hoy, ...(tenantId ? [tenantId] : [])]
        );
        return result.affectedRows;
    }
}

module.exports = TemporadaRepository;
