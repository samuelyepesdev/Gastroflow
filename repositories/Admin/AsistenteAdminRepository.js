const db = require('../../config/database');

const SLUG_ADDON = 'asistente';
const DIAS_USO = 30;

/** Consultas del módulo de administración del asistente Chef (solo superadmin). */
class AsistenteAdminRepository {
    /**
     * Una fila por restaurante activo: add-on, nombre del asistente y uso de los últimos 30 días.
     * El uso sale de tenant_audit (solo conteos: el texto de los comandos no se lee).
     */
    static async resumenTenants() {
        const [rows] = await db.query(
            `SELECT t.id, t.nombre,
                    EXISTS(SELECT 1 FROM tenant_addons ta
                           INNER JOIN addons a ON a.id = ta.addon_id
                           WHERE ta.tenant_id = t.id AND a.slug = ?) AS tiene_addon,
                    c.nombre AS nombre_asistente,
                    COALESCE(u.usos, 0) AS usos,
                    COALESCE(u.errores, 0) AS errores,
                    COALESCE(u.tokens, 0) AS tokens,
                    u.ultimo_uso
             FROM tenants t
             LEFT JOIN asistente_config c ON c.tenant_id = t.id
             LEFT JOIN (
                SELECT tenant_id,
                       COUNT(*) AS usos,
                       SUM(CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(detalles, '$.tipo')) = 'error' THEN 1 ELSE 0 END) AS errores,
                       SUM(CASE WHEN JSON_TYPE(JSON_EXTRACT(detalles, '$.tokens')) = 'INTEGER'
                                THEN JSON_EXTRACT(detalles, '$.tokens') + 0 ELSE 0 END) AS tokens,
                       MAX(created_at) AS ultimo_uso
                FROM tenant_audit
                WHERE accion = 'asistente.comando' AND tenant_id IS NOT NULL
                  AND created_at >= (NOW() - INTERVAL ${DIAS_USO} DAY)
                GROUP BY tenant_id
             ) u ON u.tenant_id = t.id
             WHERE t.activo = 1
             ORDER BY t.nombre`,
            [SLUG_ADDON]
        );
        return rows;
    }

    /** Crea o actualiza el nombre del asistente del restaurante. */
    static async guardarNombre(tenantId, nombre) {
        await db.query(
            `INSERT INTO asistente_config (tenant_id, nombre) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE nombre = VALUES(nombre)`,
            [tenantId, nombre]
        );
    }

    /** El usuario solo si pertenece a ese restaurante (evita tocar usuarios de otro por la URL). */
    static async usuarioDelTenant(tenantId, userId) {
        const [rows] = await db.query('SELECT id, tenant_id FROM usuarios WHERE id = ? AND tenant_id = ? LIMIT 1', [
            userId,
            tenantId
        ]);
        return rows[0] || null;
    }
}

module.exports = AsistenteAdminRepository;
