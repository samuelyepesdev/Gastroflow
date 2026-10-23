/**
 * PermisoRepository - Roles y permisos (panel superadmin)
 * Incluye usuarios por tenant, permisos agrupados por sección y permisos por usuario.
 */

const db = require('../../config/database');
const { PERMISSION_SECTIONS } = require('../../utils/constants');
const CacheService = require('../../services/Shared/CacheService');
const PermisosUsuarioService = require('../../services/Shared/PermisosUsuarioService');

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

            // Si no está en sección fija, agrupar por prefijo (p.ej. "soporte.ver" -> "Soporte")
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

    /** Excepciones del usuario sobre su rol: { conceder: [permiso_id], denegar: [permiso_id] } */
    static async getExcepcionesByUser(userId) {
        const [rows] = await db.query('SELECT permiso_id, efecto FROM user_permisos WHERE user_id = ?', [userId]);
        return {
            conceder: rows.filter(r => r.efecto === 'conceder').map(r => r.permiso_id),
            denegar: rows.filter(r => r.efecto === 'denegar').map(r => r.permiso_id)
        };
    }

    /** Ids de permisos a partir de sus nombres (los nombres que no existan se ignoran). */
    static async _idsPorNombre(nombres) {
        if (!nombres || nombres.length === 0) {
            return [];
        }
        const [rows] = await db.query('SELECT id FROM permisos WHERE nombre IN (?)', [nombres]);
        return rows.map(r => r.id);
    }

    /**
     * Permisos efectivos del usuario (rol + concedidos - denegados, con el techo del plan si es
     * admin del restaurante), tal como los vería el sistema. Es lo que muestra el panel.
     */
    static async getEffectivePermisoIdsByUser(userId) {
        const resuelto = await PermisosUsuarioService.resolver(userId);
        return resuelto ? PermisoRepository._idsPorNombre(resuelto.permisos) : [];
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

    /**
     * Guarda los permisos que el superadmin dejó marcados para el usuario. Se guardan solo las
     * diferencias contra lo que le corresponde por rol y plan: lo que marcó de más es una
     * concesión y lo que desmarcó es una denegación. Si no cambió nada, no queda ninguna fila y
     * el usuario sigue al rol (recibe sus permisos nuevos).
     */
    static async setPermisosForUser(userId, permisoIds) {
        const resuelto = await PermisosUsuarioService.resolver(userId);
        if (!resuelto) {
            throw new Error('Usuario no encontrado');
        }
        const deseados = new Set(permisoIds || []);
        const base = new Set(await PermisoRepository._idsPorNombre(resuelto.base));
        const conceder = [...deseados].filter(id => !base.has(id));
        const denegar = [...base].filter(id => !deseados.has(id));
        await PermisoRepository.setExcepcionesForUser(userId, { conceder, denegar });
    }

    /** Reemplaza las excepciones del usuario (en una transacción) y limpia su contexto en caché. */
    static async setExcepcionesForUser(userId, { conceder = [], denegar = [] }) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            await connection.query('DELETE FROM user_permisos WHERE user_id = ?', [userId]);
            const filas = [
                ...conceder.map(pid => [userId, pid, 'conceder']),
                ...denegar.map(pid => [userId, pid, 'denegar'])
            ];
            if (filas.length > 0) {
                await connection.query('INSERT INTO user_permisos (user_id, permiso_id, efecto) VALUES ?', [filas]);
            }
            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
        CacheService.delete(`user:ctx:${userId}`);
    }

    /** Quita todas las excepciones de los usuarios: vuelven a depender solo de su rol y su plan. */
    static async reiniciarExcepciones(userIds) {
        if (!userIds || userIds.length === 0) {
            return 0;
        }
        const [r] = await db.query('DELETE FROM user_permisos WHERE user_id IN (?)', [userIds]);
        userIds.forEach(id => CacheService.delete(`user:ctx:${id}`));
        return r.affectedRows;
    }
}

module.exports = PermisoRepository;
