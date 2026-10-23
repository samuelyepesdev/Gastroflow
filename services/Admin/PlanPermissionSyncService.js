/**
 * Efecto de un cambio de plan sobre los administradores del restaurante.
 *
 * El plan (y sus add-ons) es el techo de permisos del admin y se calcula en el momento
 * (PermisosUsuarioService), así que subir o bajar de plan ya no reescribe permisos por usuario.
 * Lo único que se hace al cambiar de plan es quitar las excepciones guardadas de los admins del
 * restaurante, para que queden exactamente con lo que su plan incluye (igual que antes, cuando
 * la sincronización les reemplazaba los permisos) y refrescar su contexto en caché.
 * Solo se tocan usuarios con rol "admin".
 */

const PermisoRepository = require('../../repositories/Admin/PermisoRepository');
const CacheService = require('../Shared/CacheService');
const { getPermissionNamesForModule, PERMISSION_TO_MODULE } = require('../../utils/planPermissions');
const { ROLES } = require('../../utils/constants');

/**
 * Nombres de permisos que implica un plan (según sus módulos).
 * Premium y Definitivo incluyen todos los permisos conocidos.
 * @param {Object|null} plan - Plan con .caracteristicas (array de slugs)
 * @returns {string[]}
 */
function getPermissionNamesForPlan(plan) {
    if (!plan) {
        return [];
    }
    const isPremium =
        plan.slug === 'premium' ||
        plan.slug === 'definitivo' ||
        (plan.nombre &&
            (plan.nombre.toLowerCase().includes('premium') || plan.nombre.toLowerCase().includes('definitivo')));

    if (isPremium) {
        return Object.keys(PERMISSION_TO_MODULE);
    }

    if (!Array.isArray(plan.caracteristicas)) {
        return [];
    }

    const names = new Set();
    for (const moduleSlug of plan.caracteristicas) {
        getPermissionNamesForModule(moduleSlug).forEach(p => names.add(p));
    }
    return [...names];
}

/** Indica si el usuario es administrador del restaurante (rol admin). */
function isAdminDelTenant(rolNombre) {
    return String(rolNombre || '').toLowerCase() === ROLES.ADMIN.toLowerCase();
}

/**
 * Se llama al cambiar el plan de un restaurante.
 * @param {number} tenantId
 * @returns {Promise<{admins: number, excepcionesQuitadas: number}>}
 */
async function syncPlanPermissionsToTenantUsers(tenantId) {
    const users = await PermisoRepository.getUsuariosByTenantId(tenantId);
    const adminIds = (users || []).filter(u => isAdminDelTenant(u.rol_nombre)).map(u => u.id);
    const excepcionesQuitadas = await PermisoRepository.reiniciarExcepciones(adminIds);
    // El techo de plan de los admins cambió: se descarta el contexto cacheado de todo el restaurante
    (users || []).forEach(u => CacheService.delete(`user:ctx:${u.id}`));
    return { admins: adminIds.length, excepcionesQuitadas };
}

module.exports = {
    getPermissionNamesForPlan,
    isAdminDelTenant,
    syncPlanPermissionsToTenantUsers
};
