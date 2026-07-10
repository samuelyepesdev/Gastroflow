/**
 * Middleware que exige que el plan del tenant incluya un módulo O que el usuario tenga un permiso que desbloquee ese módulo.
 * Debe usarse después de requireAuth y del middleware que asigna req.tenant (attachTenantContext o costeoTenantContext).
 * Superadmin siempre pasa. Si el usuario tiene un permiso asociado al módulo (ej. analitica.ver, eventos.ver), puede acceder aunque el plan no lo incluya.
 */

const { planHasModule, getPermissionNamesForModule } = require('../utils/planPermissions');
const authService = require('../services/Shared/AuthService');

/**
 * @param {string} featureSlug - Slug del módulo en el plan (ej: 'costeo', 'productos', 'analitica', 'eventos')
 * @returns {function} middleware
 */
function requirePlanFeature(featureSlug) {
    return (req, res, next) => {
        const rol = req.user && String(req.user.rol || '').toLowerCase();
        if (rol === 'superadmin') {
            return next();
        }
        const tenant = req.tenant;
        if (!tenant) {
            if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
                return res
                    .status(403)
                    .json({ error: 'Tu plan no incluye esta función. Contacta al administrador para actualizar.' });
            }
            return res
                .status(403)
                .render('errors/generic', {
                    error: { message: 'Tu plan no incluye esta función. Contacta al administrador para actualizar.' }
                });
        }
        const plan = tenant.plan || null;
        const addonSlugs = tenant.addonSlugs || [];
        const planIncludes = planHasModule(plan, featureSlug, addonSlugs);
        if (planIncludes) {
            return next();
        }
        const permisosQueDesbloquean = getPermissionNamesForModule(featureSlug);
        const userPermissions = req.user.permisos || [];
        const tienePermiso = permisosQueDesbloquean.some(p => authService.hasPermission(userPermissions, p));
        if (tienePermiso) {
            return next();
        }
        if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
            return res
                .status(403)
                .json({ error: 'Tu plan no incluye esta función. Contacta al administrador para actualizar.' });
        }
        return res
            .status(403)
            .render('errors/generic', {
                error: { message: 'Tu plan no incluye esta función. Contacta al administrador para actualizar.' }
            });
    };
}

module.exports = { requirePlanFeature };
