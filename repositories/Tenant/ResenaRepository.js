/**
 * ResenaRepository - Configuración de reseñas por restaurante y calificaciones recibidas.
 * Las fechas se guardan en UTC (TIMESTAMP): para filtrar por día usar rangoUtcColombia.
 */
const db = require('../../config/database');

class ResenaRepository {
    static async getConfig(tenantId) {
        const [rows] = await db.query('SELECT * FROM resena_config WHERE tenant_id = ?', [tenantId]);
        return rows[0] || null;
    }

    /** Crea la fila de configuración si no existe (INSERT IGNORE: seguro ante dos pestañas a la vez). */
    static async asegurarConfig(tenantId, token) {
        await db.query('INSERT IGNORE INTO resena_config (tenant_id, token_publico) VALUES (?, ?)', [tenantId, token]);
        return ResenaRepository.getConfig(tenantId);
    }

    static async actualizarConfig(tenantId, { activo, google_url, mensaje_gracias }) {
        await db.query('UPDATE resena_config SET activo = ?, google_url = ?, mensaje_gracias = ? WHERE tenant_id = ?', [
            activo ? 1 : 0,
            google_url,
            mensaje_gracias,
            tenantId
        ]);
    }

    static async setToken(tenantId, token) {
        await db.query('UPDATE resena_config SET token_publico = ? WHERE tenant_id = ?', [token, tenantId]);
    }

    /** Solo resuelve restaurantes con la página activa Y el restaurante activo. */
    static async getConfigPorToken(token) {
        const [rows] = await db.query(
            `SELECT rc.*, t.nombre AS restaurante
             FROM resena_config rc
             JOIN tenants t ON t.id = rc.tenant_id
             WHERE rc.token_publico = ? AND rc.activo = 1 AND t.activo = 1`,
            [token]
        );
        return rows[0] || null;
    }

    static async crear(tenantId, r) {
        const [res] = await db.query(
            `INSERT INTO resenas (tenant_id, calificacion, comentario, nombre, telefono, consentimiento_at, consentimiento_ip)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [tenantId, r.calificacion, r.comentario, r.nombre, r.telefono, r.consentimiento_at, r.consentimiento_ip]
        );
        return res.insertId;
    }

    /** Reseñas más recientes primero. `soloBajas` = calificación 3 o menos. */
    static async listar(tenantId, { estado = null, soloBajas = false, limite = 200 } = {}) {
        const filtros = ['tenant_id = ?'];
        const params = [tenantId];
        if (estado) {
            filtros.push('estado = ?');
            params.push(estado);
        }
        if (soloBajas) {
            filtros.push('calificacion <= 3');
        }
        params.push(Number(limite));
        const [rows] = await db.query(
            `SELECT id, calificacion, comentario, nombre, telefono, estado, created_at
             FROM resenas
             WHERE ${filtros.join(' AND ')}
             ORDER BY created_at DESC, id DESC
             LIMIT ?`,
            params
        );
        return rows;
    }

    /** Promedio, total y conteo por estrella desde `desdeUtc` (DATETIME UTC). */
    static async resumen(tenantId, desdeUtc) {
        const [rows] = await db.query(
            `SELECT calificacion, COUNT(*) AS total
             FROM resenas
             WHERE tenant_id = ? AND created_at >= ?
             GROUP BY calificacion`,
            [tenantId, desdeUtc]
        );
        const [[pendientes]] = await db.query(
            "SELECT COUNT(*) AS total FROM resenas WHERE tenant_id = ? AND estado = 'nueva' AND calificacion <= 3",
            [tenantId]
        );
        return { porEstrella: rows, bajasPendientes: pendientes.total };
    }

    static async setEstado(tenantId, id, estado) {
        const [r] = await db.query('UPDATE resenas SET estado = ? WHERE id = ? AND tenant_id = ?', [
            estado,
            id,
            tenantId
        ]);
        return r.affectedRows > 0;
    }
}

module.exports = ResenaRepository;
