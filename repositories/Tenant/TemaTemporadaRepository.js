/**
 * TemaTemporadaRepository - Tema visual de temporada (Navidad): decisión por restaurante (`tema_temporada`)
 * y configuración global del superadmin (`tema_temporada_global`, una sola fila con id = 1).
 * En `tema_temporada.activo`, NULL significa "sin decidir": hereda lo global.
 */
const db = require('../../config/database');

const COLUMNAS = `tema, activo, mensaje, animaciones,
                  DATE_FORMAT(desde, '%Y-%m-%d') AS desde, DATE_FORMAT(hasta, '%Y-%m-%d') AS hasta`;

class TemaTemporadaRepository {
    static async get(tenantId) {
        const [rows] = await db.query(`SELECT ${COLUMNAS} FROM tema_temporada WHERE tenant_id = ?`, [tenantId]);
        return rows[0] || null;
    }

    static async upsert(tenantId, d) {
        await db.query(
            `INSERT INTO tema_temporada (tenant_id, tema, activo, desde, hasta, mensaje, animaciones)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE tema = VALUES(tema), activo = VALUES(activo), desde = VALUES(desde),
                 hasta = VALUES(hasta), mensaje = VALUES(mensaje), animaciones = VALUES(animaciones)`,
            [tenantId, d.tema, d.activo, d.desde, d.hasta, d.mensaje, d.animaciones]
        );
    }

    // ------------------------------------------------------------------ global (superadmin)

    static async getGlobal() {
        const [rows] = await db.query(`SELECT ${COLUMNAS} FROM tema_temporada_global WHERE id = 1`);
        return rows[0] || null;
    }

    static async upsertGlobal(d) {
        await db.query(
            `INSERT INTO tema_temporada_global (id, tema, activo, desde, hasta, mensaje, animaciones)
             VALUES (1, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE tema = VALUES(tema), activo = VALUES(activo), desde = VALUES(desde),
                 hasta = VALUES(hasta), mensaje = VALUES(mensaje), animaciones = VALUES(animaciones)`,
            [d.tema, d.activo, d.desde, d.hasta, d.mensaje, d.animaciones]
        );
    }

    /** Restaurante activo (para validar antes de forzar su estado). */
    static async tenantExiste(tenantId) {
        const [rows] = await db.query('SELECT id FROM tenants WHERE id = ? AND activo = 1', [tenantId]);
        return rows.length > 0;
    }

    /** Fija solo la decisión (1 / 0 / NULL = hereda) sin tocar fechas ni mensaje del restaurante. */
    static async setDecision(tenantId, activo) {
        await db.query(
            `INSERT INTO tema_temporada (tenant_id, activo) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE activo = VALUES(activo)`,
            [tenantId, activo]
        );
    }

    /** Todos los restaurantes activos con su decisión de tema (si la tienen). */
    static async listarRestaurantes() {
        const [rows] = await db.query(
            `SELECT t.id, t.nombre, t.slug, tt.tema, tt.activo, tt.mensaje, tt.animaciones,
                    DATE_FORMAT(tt.desde, '%Y-%m-%d') AS desde, DATE_FORMAT(tt.hasta, '%Y-%m-%d') AS hasta,
                    (tt.tenant_id IS NOT NULL) AS tiene_fila
             FROM tenants t
             LEFT JOIN tema_temporada tt ON tt.tenant_id = t.id
             WHERE t.activo = 1
             ORDER BY t.nombre`
        );
        return rows;
    }
}

module.exports = TemaTemporadaRepository;
