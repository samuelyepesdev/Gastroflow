/**
 * PermisoRepository - Roles y permisos (panel superadmin)
 * Incluye usuarios por tenant, permisos agrupados por sección y permisos por usuario.
 */

const db = require('../../config/database');
const { PERMISSION_SECTIONS } = require('../../utils/constants');
const CacheService = require('../../services/Shared/CacheService');

class PermisoRepository {
    static async getAllRoles() {
        const [rows] = await db.query('SELECT id, nombre, descripcion FROM roles ORDER BY nombre');
        return rows;
    }

    static async getAllPermisos() {
        const [rows] = await db.query('SELECT id, nombre, descripcion FROM permisos ORDER BY nombre');
        return rows;
    }

    /**
     * Permisos agrupados por sección para el panel (Clientes, Productos, Eventos, etc.)
     * @returns {Promise<Array<{ seccion: string, permisos: Array<{id, nombre, descripcion}> }>>}
     */
    static async getPermisosAgrupadosPorSeccion() {
        const permisos = await PermisoRepository.getAllPermisos();
        const mappedSections = {};

        // 1. Inicializar con secciones fijas para mantener orden preferido
        for (const seccion of Object.keys(PERMISSION_SECTIONS)) {
            mappedSections[seccion] = [];
        }

        // 2. Distribuir permisos
        permisos.forEach(p => {
            let found = false;
            // Buscar en secciones fijas
            for (const [seccion, nombres] of Object.entries(PERMISSION_SECTIONS)) {
                if (nombres.includes(p.nombre)) {
                    mappedSections[seccion].push(p);
                    found = true;
                    break;
                }
            }

            // Si no está en sección fija, agrupar por prefijo (p.ej. "whatsapp.ver" -> "Whatsapp")
            if (!found) {
                const prefix = p.nombre.split('.')[0];
                const seccionName = prefix.charAt(0).toUpperCase() + prefix.slice(1);

                if (!mappedSections[seccionName]) {
                    mappedSections[seccionName] = [];
                }
                mappedSections[seccionName].push(p);
            }
        });

        // 3. Convertir a array filtrando vacíos
        const result = [];
        for (const [seccion, list] of Object.entries(mappedSections)) {
            if (list.length > 0) {
                result.push({ seccion, permisos: list });
            }
        }
        return result;
    }

    static async getPermisoIdsByRol(rolId) {
        const [rows] = await db.query('SELECT permiso_id FROM rol_permisos WHERE rol_id = ?', [rolId]);
        return rows.map(r => r.permiso_id);
    }

    static async setPermisosForRol(rolId, permisoIds) {
        const connection = await db.getConnection();
        try {
            await connection.query('DELETE FROM rol_permisos WHERE rol_id = ?', [rolId]);
            if (permisoIds && permisoIds.length > 0) {
                const values = permisoIds.map(pid => [rolId, pid]);
                await connection.query('INSERT INTO rol_permisos (rol_id, permiso_id) VALUES ?', [values]);
            }
        } finally {
            connection.release();
        }
        // Un cambio de rol afecta a todos sus usuarios; se limpia todo el contexto
        // cacheado en vez de resolver qué usuarios específicos tienen ese rol.
        CacheService.deleteByPrefix('user:ctx:');
    }

    /** Usuarios de un tenant (para asignar permisos por restaurante) */
    static async getUsuariosByTenantId(tenantId) {
        if (tenantId === null || tenantId === undefined) {
            return [];
        }
        const [rows] = await db.query(
            `SELECT u.id, u.username, u.nombre_completo, u.email, u.activo, u.rol_id, r.nombre AS rol_nombre
             FROM usuarios u
             INNER JOIN roles r ON u.rol_id = r.id
             WHERE u.tenant_id = ?
             ORDER BY u.nombre_completo, u.username`,
            [tenantId]
        );
        return rows;
    }

    /** IDs de permisos asignados directamente al usuario (user_permisos) */
    static async getPermisoIdsByUser(userId) {
        const [rows] = await db.query('SELECT permiso_id FROM user_permisos WHERE user_id = ?', [userId]);
        return rows.map(r => r.permiso_id);
    }

    /**
     * Permisos efectivos para mostrar en el panel: si el usuario tiene user_permisos (el Superadmin
     * ya personalizó), devolver esos; si no, devolver los del rol (así el panel muestra el estado real).
     */
    static async getEffectivePermisoIdsByUser(userId) {
        const [userRows] = await db.query('SELECT rol_id FROM usuarios WHERE id = ?', [userId]);
        if (!userRows.length) {
            return [];
        }
        const rolId = userRows[0].rol_id;
        const [rolePerms] = await db.query('SELECT permiso_id FROM rol_permisos WHERE rol_id = ?', [rolId]);
        const roleIds = (rolePerms || []).map(r => r.permiso_id);
        const userIds = await PermisoRepository.getPermisoIdsByUser(userId);
        if (userIds && userIds.length > 0) {
            return userIds;
        }
        return roleIds;
    }

    /** Obtener IDs de permisos cuyos nombres están en la lista (para sincronizar con plan) */
    static async getPermisoIdsByNames(permissionNames) {
        if (!permissionNames || permissionNames.length === 0) {
            return [];
        }
        const placeholders = permissionNames.map(() => '?').join(',');
        const [rows] = await db.query(`SELECT id FROM permisos WHERE nombre IN (${placeholders})`, permissionNames);
        return (rows || []).map(r => r.id);
    }

    /** Asignar permisos directos al usuario (reemplazo: si tiene alguno, esos son los efectivos) */
    static async setPermisosForUser(userId, permisoIds) {
        const connection = await db.getConnection();
        try {
            await connection.query('DELETE FROM user_permisos WHERE user_id = ?', [userId]);
            if (permisoIds && permisoIds.length > 0) {
                const values = permisoIds.map(pid => [userId, pid]);
                await connection.query('INSERT INTO user_permisos (user_id, permiso_id) VALUES ?', [values]);
            }
        } finally {
            connection.release();
        }
        CacheService.delete(`user:ctx:${userId}`);
    }
}

module.exports = PermisoRepository;
