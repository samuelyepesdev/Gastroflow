/**
 * PermisosMasivosService - Gestión de permisos a escala desde el panel de superadmin.
 *
 * - Edición masiva: conceder / denegar / volver al estándar un conjunto de permisos a todos los usuarios
 *   de ciertos roles en ciertos restaurantes (todos, por plan o una selección).
 * - Reporte de excepciones: qué usuarios se apartan de su rol, y volverlos al estándar.
 * - Matriz de roles: los permisos por defecto de cada rol (afectan a todos sus usuarios).
 *
 * Las excepciones guardadas son siempre las MÍNIMAS: si conceder un permiso que el usuario ya recibe por
 * su rol/plan, no se guarda nada (y se borra una excepción previa que ya no hace falta). Así el reporte
 * de excepciones solo muestra diferencias reales. La vista previa y la aplicación usan el mismo plan de
 * cambios, así que lo que se previsualiza es exactamente lo que se aplica.
 */
const db = require('../../config/database');
const CacheService = require('../Shared/CacheService');
const PermisosUsuarioService = require('../Shared/PermisosUsuarioService');
const PermisoRepository = require('../../repositories/Admin/PermisoRepository');
const TenantAuditService = require('./TenantAuditService');
const { ROLES } = require('../../utils/constants');

const ACCIONES = ['conceder', 'denegar', 'quitar'];
const LOTE = 500;

function errorDe(status, mensaje) {
    const e = new Error(mensaje);
    e.status = status;
    return e;
}

const enteros = lista => [
    ...new Set((Array.isArray(lista) ? lista : []).map(n => Number.parseInt(n, 10)).filter(n => n > 0))
];

function porLotes(lista, tamano = LOTE) {
    const lotes = [];
    for (let i = 0; i < lista.length; i += tamano) {
        lotes.push(lista.slice(i, i + tamano));
    }
    return lotes;
}

class PermisosMasivosService {
    // ---------------------------------------------------------------- datos para la pantalla

    /** Restaurantes con su plan, para elegir el alcance. */
    static async listarRestaurantes() {
        const [rows] = await db.query(
            `SELECT t.id, t.nombre, t.plan_id, pl.nombre AS plan_nombre, t.tenant_padre_id
             FROM tenants t LEFT JOIN planes pl ON pl.id = t.plan_id
             ORDER BY t.nombre`
        );
        return rows;
    }

    // ---------------------------------------------------------------- edición masiva

    /** Valida y normaliza los parámetros del alcance y la acción. Lanza 400 si algo no tiene sentido. */
    static async _normalizar(params = {}) {
        const accion = params.accion;
        if (!ACCIONES.includes(accion)) {
            throw errorDe(400, 'Acción inválida');
        }
        const roles = [...new Set((Array.isArray(params.roles) ? params.roles : []).map(String))].filter(
            r => r !== ROLES.SUPERADMIN
        );
        if (roles.length === 0) {
            throw errorDe(400, 'Elige al menos un rol');
        }
        const permisoIds = enteros(params.permiso_ids);
        if (permisoIds.length === 0 && accion !== 'quitar') {
            throw errorDe(400, 'Elige al menos un permiso');
        }
        if (permisoIds.length > 0) {
            const [existentes] = await db.query('SELECT id FROM permisos WHERE id IN (?)', [permisoIds]);
            if (existentes.length !== permisoIds.length) {
                throw errorDe(400, 'Hay permisos que no existen');
            }
        }
        const modo = params.modo || 'todos';
        if (!['todos', 'planes', 'manual'].includes(modo)) {
            throw errorDe(400, 'Alcance inválido');
        }
        const planIds = enteros(params.plan_ids);
        const tenantIds = enteros(params.tenant_ids);
        if (modo === 'planes' && planIds.length === 0) {
            throw errorDe(400, 'Elige al menos un plan');
        }
        if (modo === 'manual' && tenantIds.length === 0) {
            throw errorDe(400, 'Elige al menos un restaurante');
        }
        return { accion, roles, permisoIds, modo, planIds, tenantIds };
    }

    /** Usuarios que entran en el alcance, con sus roles y excepciones actuales. */
    static async _cargarUsuarios({ roles, modo, planIds, tenantIds }) {
        const filtros = ['r.nombre IN (?)'];
        const valores = [roles];
        if (modo === 'planes') {
            filtros.push('t.plan_id IN (?)');
            valores.push(planIds);
        } else if (modo === 'manual') {
            filtros.push('u.tenant_id IN (?)');
            valores.push(tenantIds);
        }
        const [usuarios] = await db.query(
            `SELECT u.id, u.username, u.tenant_id, u.rol_id, r.nombre AS rol_nombre, t.nombre AS tenant_nombre
             FROM usuarios u
             INNER JOIN roles r ON r.id = u.rol_id
             INNER JOIN tenants t ON t.id = u.tenant_id
             WHERE ${filtros.join(' AND ')}`,
            valores
        );

        const rolesExtra = new Map();
        const excepciones = new Map();
        for (const lote of porLotes(usuarios.map(u => u.id))) {
            const [extra] = await db
                .query('SELECT user_id, rol_id FROM usuario_roles WHERE user_id IN (?)', [lote])
                .catch(() => [[]]);
            extra.forEach(e => rolesExtra.set(e.user_id, [...(rolesExtra.get(e.user_id) || []), e.rol_id]));
            const [exc] = await db.query('SELECT user_id, permiso_id, efecto FROM user_permisos WHERE user_id IN (?)', [
                lote
            ]);
            exc.forEach(e => {
                if (!excepciones.has(e.user_id)) {
                    excepciones.set(e.user_id, new Map());
                }
                excepciones.get(e.user_id).set(e.permiso_id, e.efecto);
            });
        }
        return usuarios.map(u => ({
            ...u,
            rolIds: [...new Set([u.rol_id, ...(rolesExtra.get(u.id) || [])])],
            excepciones: excepciones.get(u.id) || new Map()
        }));
    }

    /**
     * Calcula, sin escribir nada, qué cambia en cada usuario.
     * @returns {Promise<{usuarios: number, restaurantes: number, premium: number, cambios: Array, muestra: Array}>}
     */
    static async planificar(params) {
        const p = await PermisosMasivosService._normalizar(params);
        const usuarios = await PermisosMasivosService._cargarUsuarios(p);

        const [permisos] = await db.query('SELECT id, nombre FROM permisos');
        const idPorNombre = new Map(permisos.map(x => [x.nombre, x.id]));
        const [filasRol] = await db.query('SELECT rol_id, permiso_id FROM rol_permisos');
        const permisosDeRol = new Map();
        filasRol.forEach(f => {
            if (!permisosDeRol.has(f.rol_id)) {
                permisosDeRol.set(f.rol_id, new Set());
            }
            permisosDeRol.get(f.rol_id).add(f.permiso_id);
        });

        const baseAdminPorGrupo = new Map(); // mismo restaurante y mismos roles => misma base
        const cambios = [];
        let premium = 0;

        for (const u of usuarios) {
            let base;
            if (u.rol_nombre === ROLES.ADMIN) {
                const clave = `${u.tenant_id}:${u.rolIds.join(',')}`;
                if (!baseAdminPorGrupo.has(clave)) {
                    baseAdminPorGrupo.set(
                        clave,
                        await PermisosUsuarioService.resolver(u.id, {
                            rolIds: u.rolIds,
                            rolNombre: u.rol_nombre,
                            tenantId: u.tenant_id
                        })
                    );
                }
                const resuelto = baseAdminPorGrupo.get(clave);
                if (resuelto.premium) {
                    premium++; // en Premium/Definitivo las excepciones no aplican: no hay nada que cambiar
                    continue;
                }
                base = new Set(resuelto.base.map(n => idPorNombre.get(n)).filter(Boolean));
            } else {
                base = new Set();
                u.rolIds.forEach(rid => (permisosDeRol.get(rid) || new Set()).forEach(pid => base.add(pid)));
            }

            const guardar = [];
            const borrar = [];
            const objetivo = p.permisoIds.length > 0 ? p.permisoIds : [...u.excepciones.keys()]; // quitar sin permisos = todas
            for (const pid of objetivo) {
                const actual = u.excepciones.get(pid);
                if (p.accion === 'quitar') {
                    if (actual) {
                        borrar.push(pid);
                    }
                } else if (p.accion === 'conceder') {
                    if (base.has(pid)) {
                        if (actual) {
                            borrar.push(pid);
                        }
                    } else if (actual !== 'conceder') {
                        guardar.push([u.id, pid, 'conceder']);
                    }
                } else if (!base.has(pid)) {
                    if (actual) {
                        borrar.push(pid);
                    }
                } else if (actual !== 'denegar') {
                    guardar.push([u.id, pid, 'denegar']);
                }
            }
            if (guardar.length > 0 || borrar.length > 0) {
                cambios.push({
                    userId: u.id,
                    username: u.username,
                    tenantId: u.tenant_id,
                    tenant: u.tenant_nombre,
                    guardar,
                    borrar
                });
            }
        }

        return {
            usuarios: usuarios.length,
            restaurantes: new Set(usuarios.map(u => u.tenant_id)).size,
            premium,
            cambios,
            parametros: p
        };
    }

    /** Resumen para la vista previa (sin los detalles internos del plan de cambios). */
    static async previsualizar(params) {
        const plan = await PermisosMasivosService.planificar(params);
        return PermisosMasivosService._resumen(plan);
    }

    static _resumen(plan) {
        return {
            usuarios: plan.usuarios,
            restaurantes: plan.restaurantes,
            usuariosConCambios: plan.cambios.length,
            restaurantesConCambios: new Set(plan.cambios.map(c => c.tenantId)).size,
            sinCambios: plan.usuarios - plan.premium - plan.cambios.length,
            premium: plan.premium,
            muestra: plan.cambios.slice(0, 8).map(c => ({ usuario: c.username, restaurante: c.tenant }))
        };
    }

    /** Aplica el plan de cambios en una transacción y deja el registro en la auditoría. */
    static async aplicar(params, { superadminId = null } = {}) {
        const plan = await PermisosMasivosService.planificar(params);
        const guardar = plan.cambios.flatMap(c => c.guardar);
        const borrar = plan.cambios.flatMap(c => c.borrar.map(pid => [c.userId, pid]));

        if (guardar.length > 0 || borrar.length > 0) {
            const connection = await db.getConnection();
            try {
                await connection.beginTransaction();
                for (const lote of porLotes(borrar)) {
                    await connection.query('DELETE FROM user_permisos WHERE (user_id, permiso_id) IN (?)', [lote]);
                }
                for (const lote of porLotes(guardar)) {
                    await connection.query(
                        'INSERT INTO user_permisos (user_id, permiso_id, efecto) VALUES ? ON DUPLICATE KEY UPDATE efecto = VALUES(efecto)',
                        [lote]
                    );
                }
                await connection.commit();
            } catch (error) {
                await connection.rollback();
                throw error;
            } finally {
                connection.release();
            }
            CacheService.deleteByPrefix('user:ctx:');
        }

        const resumen = PermisosMasivosService._resumen(plan);
        await PermisosMasivosService._auditar(superadminId, `permisos.masivo.${plan.parametros.accion}`, {
            roles: plan.parametros.roles,
            alcance: plan.parametros.modo,
            planes: plan.parametros.planIds,
            restaurantes: plan.parametros.tenantIds,
            permisos: await PermisosMasivosService._nombres(plan.parametros.permisoIds),
            usuarios_modificados: resumen.usuariosConCambios,
            restaurantes_modificados: resumen.restaurantesConCambios
        });
        return resumen;
    }

    // ---------------------------------------------------------------- reporte de excepciones

    /**
     * Usuarios que se apartan de su rol, con lo que se les concedió y denegó.
     * @param {{tenantId?: number, rol?: string, q?: string, limite?: number}} filtros
     */
    static async listarExcepciones({ tenantId, rol, q, limite = 200 } = {}) {
        const filtros = [];
        const valores = [];
        if (tenantId) {
            filtros.push('u.tenant_id = ?');
            valores.push(Number(tenantId));
        }
        if (rol) {
            filtros.push('r.nombre = ?');
            valores.push(String(rol));
        }
        if (q) {
            filtros.push('(u.username LIKE ? OR u.nombre_completo LIKE ? OR t.nombre LIKE ?)');
            valores.push(...Array(3).fill(`%${String(q).slice(0, 60)}%`));
        }
        const where = filtros.length ? `AND ${filtros.join(' AND ')}` : '';
        const desde = `FROM usuarios u
             INNER JOIN roles r ON r.id = u.rol_id
             LEFT JOIN tenants t ON t.id = u.tenant_id
             WHERE EXISTS (SELECT 1 FROM user_permisos up WHERE up.user_id = u.id) ${where}`;

        const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total ${desde}`, valores);
        const [usuarios] = await db.query(
            `SELECT u.id, u.username, u.nombre_completo, u.activo, r.nombre AS rol_nombre, t.id AS tenant_id, t.nombre AS tenant_nombre
             ${desde} ORDER BY t.nombre, u.username LIMIT ?`,
            [...valores, Math.min(Number(limite) || 200, 500)]
        );
        if (usuarios.length === 0) {
            return { total, usuarios: [] };
        }
        const [filas] = await db.query(
            `SELECT up.user_id, up.efecto, p.nombre
             FROM user_permisos up INNER JOIN permisos p ON p.id = up.permiso_id
             WHERE up.user_id IN (?) ORDER BY p.nombre`,
            [usuarios.map(u => u.id)]
        );
        return {
            total,
            usuarios: usuarios.map(u => ({
                ...u,
                concedidos: filas.filter(f => f.user_id === u.id && f.efecto === 'conceder').map(f => f.nombre),
                denegados: filas.filter(f => f.user_id === u.id && f.efecto === 'denegar').map(f => f.nombre)
            }))
        };
    }

    /** Quita todas las excepciones de los usuarios indicados: vuelven a su rol y plan. */
    static async reiniciarUsuarios(userIds, { superadminId = null } = {}) {
        const ids = enteros(userIds);
        if (ids.length === 0) {
            throw errorDe(400, 'No hay usuarios para reiniciar');
        }
        const filasBorradas = await PermisoRepository.reiniciarExcepciones(ids);
        await PermisosMasivosService._auditar(superadminId, 'permisos.reiniciar', {
            usuarios: ids.length,
            excepciones_quitadas: filasBorradas
        });
        return { usuarios: ids.length, excepcionesQuitadas: filasBorradas };
    }

    // ---------------------------------------------------------------- matriz de roles

    /** Roles (salvo superadmin) con sus permisos y cuántos usuarios los tienen como rol principal. */
    static async obtenerMatrizRoles() {
        const roles = (await PermisoRepository.getAllRoles()).filter(r => r.nombre !== ROLES.SUPERADMIN);
        const [conteo] = await db.query('SELECT rol_id, COUNT(*) AS usuarios FROM usuarios GROUP BY rol_id');
        const usuariosPorRol = new Map(conteo.map(c => [c.rol_id, c.usuarios]));
        const resultado = [];
        for (const r of roles) {
            resultado.push({
                id: r.id,
                nombre: r.nombre,
                usuarios: usuariosPorRol.get(r.id) || 0,
                permiso_ids: await PermisoRepository.getPermisoIdsByRol(r.id)
            });
        }
        return resultado;
    }

    /** Reemplaza los permisos por defecto de un rol. Afecta a todos sus usuarios. */
    static async guardarPermisosRol(rolId, permisoIds, { superadminId = null } = {}) {
        const [roles] = await db.query('SELECT id, nombre FROM roles WHERE id = ?', [rolId]);
        if (roles.length === 0) {
            throw errorDe(404, 'Rol no encontrado');
        }
        if (roles[0].nombre === ROLES.SUPERADMIN) {
            throw errorDe(400, 'El rol superadmin no se edita desde aquí');
        }
        const nuevos = enteros(permisoIds);
        if (nuevos.length > 0) {
            const [existentes] = await db.query('SELECT id FROM permisos WHERE id IN (?)', [nuevos]);
            if (existentes.length !== nuevos.length) {
                throw errorDe(400, 'Hay permisos que no existen');
            }
        }
        const antes = new Set(await PermisoRepository.getPermisoIdsByRol(rolId));
        const despues = new Set(nuevos);
        const agregados = nuevos.filter(id => !antes.has(id));
        const quitados = [...antes].filter(id => !despues.has(id));
        if (agregados.length === 0 && quitados.length === 0) {
            return { agregados: [], quitados: [] };
        }
        await PermisoRepository.setPermisosForRol(rolId, nuevos);
        const resultado = {
            agregados: await PermisosMasivosService._nombres(agregados),
            quitados: await PermisosMasivosService._nombres(quitados)
        };
        await PermisosMasivosService._auditar(superadminId, 'permisos.rol', { rol: roles[0].nombre, ...resultado });
        return resultado;
    }

    // ---------------------------------------------------------------- auditoría

    static async _nombres(ids) {
        if (!ids || ids.length === 0) {
            return [];
        }
        const [rows] = await db.query('SELECT nombre FROM permisos WHERE id IN (?) ORDER BY nombre', [ids]);
        return rows.map(r => r.nombre);
    }

    /** La auditoría nunca debe tumbar una operación que ya se aplicó. */
    static async _auditar(userId, accion, detalles) {
        try {
            await TenantAuditService.log({ tenantId: null, userId, accion, detalles: JSON.stringify(detalles) });
        } catch (error) {
            console.error('No se pudo registrar la auditoría de permisos:', error.message);
        }
    }

    /** Últimos cambios de permisos hechos desde el panel. */
    static async listarAuditoria(limite = 50) {
        const [rows] = await db.query(
            `SELECT a.id, a.accion, a.detalles, a.created_at, u.username
             FROM tenant_audit a LEFT JOIN usuarios u ON u.id = a.user_id
             WHERE a.accion LIKE 'permisos.%' ORDER BY a.id DESC LIMIT ?`,
            [Math.min(Number(limite) || 50, 200)]
        );
        return rows.map(r => {
            let detalles;
            try {
                detalles = r.detalles ? JSON.parse(r.detalles) : null;
            } catch {
                detalles = null;
            }
            return { ...r, detalles };
        });
    }
}

module.exports = PermisosMasivosService;
