/**
 * PermisosUsuarioService - Única fuente del cálculo de permisos efectivos de un usuario.
 * Lo usan el login (JWT), el contexto por petición (AuthService.getUserById) y el panel de
 * superadmin, para que los tres vean exactamente lo mismo.
 *
 *   permisos = (permisos de sus roles + concedidos) - denegados
 *
 * - Los permisos del rol salen de rol_permisos (unión de todos sus roles).
 * - user_permisos guarda solo excepciones sobre el rol: 'conceder' o 'denegar'.
 * - Admin del restaurante: el plan (y sus add-ons) manda, calculado en el momento. Tiene los permisos
 *   de su rol que el plan permite y todos los que el plan incluye; los de módulos que el plan no
 *   incluye no cuentan, salvo que se le hayan concedido a mano.
 * - Admin de un plan Premium/Definitivo: tiene todos los permisos (las excepciones no aplican).
 */
const db = require('../../config/database');
const AddonRepository = require('../../repositories/Admin/AddonRepository');
const { PERMISSION_TO_MODULE, planHasModule } = require('../../utils/planPermissions');
const { ROLES } = require('../../utils/constants');

// Mismos slugs que AuthService usaba para dar "todos los permisos" al admin
const PLANES_CON_TODO = ['premium', 'definitivo'];

function parsearCaracteristicas(valor) {
    if (Array.isArray(valor)) {
        return valor;
    }
    if (typeof valor === 'string' && valor) {
        try {
            const parsed = JSON.parse(valor);
            return Array.isArray(parsed) ? parsed : null;
        } catch {
            return null;
        }
    }
    return null;
}

/** Suma los concedidos y quita los denegados (puro). Un permiso denegado nunca queda. */
function combinar({ base = [], concedidos = [], denegados = [] }) {
    const conjunto = new Set(base);
    concedidos.forEach(p => conjunto.add(p));
    denegados.forEach(p => conjunto.delete(p));
    return [...conjunto];
}

/** Quita los permisos de módulos que el plan y sus add-ons no incluyen (puro). */
function aplicarTechoDePlan(nombres, plan, addonSlugs = []) {
    return nombres.filter(nombre => {
        const modulo = PERMISSION_TO_MODULE[nombre];
        return !modulo || planHasModule(plan, modulo, addonSlugs);
    });
}

/** Permisos conocidos cuyo módulo incluye el plan (o un add-on). Lo que el plan le da al admin (puro). */
function permisosDelPlan(plan, addonSlugs = []) {
    return Object.keys(PERMISSION_TO_MODULE).filter(nombre =>
        planHasModule(plan, PERMISSION_TO_MODULE[nombre], addonSlugs)
    );
}

class PermisosUsuarioService {
    /** Rol principal, todos sus roles (principal + usuario_roles) y tenant del usuario. */
    static async _cargarUsuario(userId) {
        const [filas] = await db.query(
            `SELECT u.rol_id, u.tenant_id, r.nombre AS rol_nombre
             FROM usuarios u INNER JOIN roles r ON r.id = u.rol_id WHERE u.id = ?`,
            [userId]
        );
        if (!filas.length) {
            return null;
        }
        const [adicionales] = await db
            .query('SELECT rol_id FROM usuario_roles WHERE user_id = ?', [userId])
            .catch(() => [[]]);
        const rolIds = [...new Set([filas[0].rol_id, ...(adicionales || []).map(r => r.rol_id)])];
        return { rolIds, rolNombre: filas[0].rol_nombre, tenantId: filas[0].tenant_id };
    }

    /** Plan del tenant (con sus características) y slugs de add-ons activos. */
    static async _cargarPlan(tenantId) {
        const [filas] = await db.query(
            `SELECT pl.slug, pl.nombre, pl.caracteristicas
             FROM tenants t LEFT JOIN planes pl ON pl.id = t.plan_id WHERE t.id = ?`,
            [tenantId]
        );
        const fila = filas[0];
        const plan =
            fila && fila.slug !== null
                ? { ...fila, caracteristicas: parsearCaracteristicas(fila.caracteristicas) }
                : null;
        const addons = await AddonRepository.getByTenant(tenantId).catch(() => []);
        return { plan, addonSlugs: (addons || []).map(a => a.slug) };
    }

    /**
     * Permisos efectivos de un usuario.
     * @param {number} userId
     * @param {{rolIds: number[], rolNombre: string, tenantId: number|null}} [contexto] ya cargado
     *   (el login y getUserById lo tienen a mano y evitan una consulta)
     * @returns {Promise<{permisos: string[], base: string[], concedidos: string[], denegados: string[], premium: boolean}|null>}
     *   base = lo que le corresponde por rol y plan antes de las excepciones
     */
    static async resolver(userId, contexto) {
        const usuario =
            contexto && Array.isArray(contexto.rolIds) ? contexto : await PermisosUsuarioService._cargarUsuario(userId);
        if (!usuario) {
            return null;
        }
        const [permisosRol] = await db.query(
            `SELECT DISTINCT p.nombre FROM permisos p
             INNER JOIN rol_permisos rp ON rp.permiso_id = p.id
             WHERE rp.rol_id IN (?)`,
            [usuario.rolIds]
        );
        const delRol = (permisosRol || []).map(p => p.nombre);

        const esAdminDeRestaurante =
            String(usuario.rolNombre || '').toLowerCase() === ROLES.ADMIN &&
            usuario.tenantId !== null &&
            usuario.tenantId !== undefined;
        let base = delRol;
        if (esAdminDeRestaurante) {
            const { plan, addonSlugs } = await PermisosUsuarioService._cargarPlan(usuario.tenantId);
            if (plan && PLANES_CON_TODO.includes(plan.slug)) {
                // Todo lo que el sistema conoce, más lo que su rol tenga fuera del mapa de módulos
                const todos = combinar({ base: Object.keys(PERMISSION_TO_MODULE), concedidos: delRol });
                return { permisos: todos, base: todos, concedidos: [], denegados: [], premium: true };
            }
            // Lo de su rol que el plan permite, más todo lo que el plan incluye aunque el rol no lo traiga
            base = combinar({
                base: aplicarTechoDePlan(delRol, plan, addonSlugs),
                concedidos: permisosDelPlan(plan, addonSlugs)
            });
        }

        const [excepciones] = await db.query(
            `SELECT p.nombre, up.efecto FROM user_permisos up
             INNER JOIN permisos p ON p.id = up.permiso_id WHERE up.user_id = ?`,
            [userId]
        );
        const concedidos = (excepciones || []).filter(e => e.efecto === 'conceder').map(e => e.nombre);
        const denegados = (excepciones || []).filter(e => e.efecto === 'denegar').map(e => e.nombre);
        return { permisos: combinar({ base, concedidos, denegados }), base, concedidos, denegados, premium: false };
    }
}

module.exports = PermisosUsuarioService;
module.exports.combinar = combinar;
module.exports.aplicarTechoDePlan = aplicarTechoDePlan;
module.exports.permisosDelPlan = permisosDelPlan;
