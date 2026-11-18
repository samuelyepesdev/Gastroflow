/**
 * TemaTemporadaRepository - Configuración del tema visual de temporada (Navidad) por restaurante.
 */
const db = require('../../config/database');

class TemaTemporadaRepository {
    static async get(tenantId) {
        const [rows] = await db.query(
            `SELECT tema, activo, mensaje, animaciones,
                    DATE_FORMAT(desde, '%Y-%m-%d') AS desde, DATE_FORMAT(hasta, '%Y-%m-%d') AS hasta
             FROM tema_temporada WHERE tenant_id = ?`,
            [tenantId]
        );
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
}

module.exports = TemaTemporadaRepository;
