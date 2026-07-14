/**
 * Tenant middleware - Attaches tenant context after authentication.
 * Must run after requireAuth. Validates tenant exists and is active.
 * Sets req.tenant and req.user.tenant_id for use in services/repos.
 */

const TenantRepository = require('../repositories/Admin/TenantRepository');
const AddonRepository = require('../repositories/Admin/AddonRepository');
const AuthService = require('../services/Shared/AuthService');
const CacheService = require('../services/Shared/CacheService');
const { getAllowedByPlan, getAllowedForUser } = require('../utils/planPermissions');

/** TTL del contexto de tenant (usuario/permisos, tenant, add-ons) en el CacheService en memoria. */
const CONTEXT_TTL_SECONDS = 45;

/**
 * Slugs de add-ons activos del tenant (tenant_addons). Nunca debe tumbar el request:
 * si falla, se asume sin add-ons (el acceso sigue dependiendo del plan/permisos).
 * Cacheado por tenant (cambia poco) para evitar una query por request.
 */
async function getAddonSlugs(tenantId) {
    const cacheKey = `addons:${tenantId}`;
    const cached = CacheService.get(cacheKey);
    if (cached) {
        return cached;
    }
    try {
        const addons = await AddonRepository.getByTenant(tenantId);
        const slugs = (addons || []).map(a => a.slug);
        CacheService.set(cacheKey, slugs, CONTEXT_TTL_SECONDS);
        return slugs;
    } catch (error) {
        console.error('Error al cargar add-ons del tenant:', error);
        return [];
    }
}

/**
 * Tenant por id, cacheado con TTL corto. Se invalida proactivamente en
 * TenantCRUDService al mutar un tenant para que los cambios del superadmin
 * se sientan inmediatos en vez de esperar el TTL.
 */
async function getCachedTenant(tenantId) {
    const cacheKey = `tenant:${tenantId}`;
    const cached = CacheService.get(cacheKey);
    if (cached) {
        return cached;
    }
    const tenant = await TenantRepository.findById(tenantId);
    if (tenant) {
        CacheService.set(cacheKey, tenant, CONTEXT_TTL_SECONDS);
    }
    return tenant;
}

/**
 * Resolve tenant for the current user and attach to request.
 * - Refresca permisos del usuario desde BD (para que cambios del Superadmin se vean sin cerrar sesión).
 * - Uses req.user.tenant_id from JWT; if missing, falls back to default tenant (principal).
 * - Validates tenant exists and is active.
 * - Sets req.tenant (full tenant object with config) for views and services.
 */
async function attachTenantContext(req, res, next) {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'No autenticado' });
        }

        const rol = String(req.user.rol || '').toLowerCase();
        if (rol !== 'superadmin' && req.user.id) {
            const userCacheKey = `user:ctx:${req.user.id}`;
            let freshUser = CacheService.get(userCacheKey);
            if (!freshUser) {
                freshUser = await AuthService.getUserById(req.user.id);
                if (freshUser) {
                    CacheService.set(userCacheKey, freshUser, CONTEXT_TTL_SECONDS);
                }
            }
            if (freshUser && Array.isArray(freshUser.permisos)) {
                req.user.permisos = freshUser.permisos;
            }
        }

        let tenantId = req.user.tenant_id;

        // If user has no tenant_id (old token or legacy user), use default tenant
        if (tenantId === null || tenantId === undefined) {
            const defaultTenant = await TenantRepository.getDefault();
            if (!defaultTenant) {
                if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
                    return res.status(403).json({ error: 'No hay tenant configurado' });
                }
                return res.status(403).render('errors/generic', { error: { message: 'No hay tenant configurado' } });
            }
            tenantId = defaultTenant.id;
            req.user.tenant_id = tenantId;
        }

        const cachedTenant = await getCachedTenant(tenantId);
        if (!cachedTenant) {
            if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
                return res.status(403).json({ error: 'Tenant no encontrado' });
            }
            res.clearCookie('auth_token');
            return res.redirect(
                '/auth/login?mensaje=' + encodeURIComponent('Restaurante no encontrado. Contacta al administrador.')
            );
        }

        if (!cachedTenant.activo) {
            const msg =
                'Tu restaurante "' + (cachedTenant.nombre || '') + '" está desactivado. Contacta al administrador.';
            if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
                res.clearCookie('auth_token');
                return res.status(403).json({ error: msg, redirect: '/auth/login' });
            }
            res.clearCookie('auth_token');
            return res.redirect('/auth/login?mensaje=' + encodeURIComponent(msg));
        }

        // addonSlugs es a nivel tenant (mismo valor para cualquier request de ese tenant),
        // así que mutar el objeto cacheado es seguro: requests concurrentes calculan el
        // mismo valor y no se pisan entre sí.
        const tenant = cachedTenant;
        tenant.addonSlugs = await getAddonSlugs(tenant.id);

        req.tenant = tenant;
        res.locals.tenant = tenant;
        // Navbar y vistas: mostrar módulo si el plan lo incluye, si tiene un add-on que lo
        // desbloquea, O si el usuario tiene permiso (Superadmin lo asignó)
        res.locals.allowedByPlan = getAllowedForUser(tenant.plan || null, req.user.permisos || [], tenant.addonSlugs);
        next();
    } catch (error) {
        console.error('Error en attachTenantContext:', error);
        if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
            return res.status(500).json({ error: 'Error al cargar contexto del tenant' });
        }
        res.status(500).render('errors/generic', { error: { message: 'Error al cargar contexto del tenant' } });
    }
}

/**
 * For /costeo: if superadmin, set req.tenant from query.tenant_id; else use attachTenantContext.
 * Superadmin must pass ?tenant_id=X when accessing costeo (page or API).
 */
async function costeoTenantContext(req, res, next) {
    const rol = req.user && String(req.user.rol || '').toLowerCase();
    if (rol === 'superadmin') {
        const tenantId = req.query.tenant_id ? parseInt(req.query.tenant_id, 10) : null;
        if (tenantId) {
            try {
                const tenant = await TenantRepository.findById(tenantId);
                if (tenant) {
                    tenant.addonSlugs = await getAddonSlugs(tenant.id);
                    req.tenant = tenant;
                    res.locals.tenant = tenant;
                    res.locals.allowedByPlan = getAllowedByPlan(tenant.plan || null, tenant.addonSlugs);
                } else {
                    req.tenant = null;
                    res.locals.allowedByPlan = getAllowedByPlan(null);
                }
            } catch (e) {
                req.tenant = null;
                res.locals.allowedByPlan = getAllowedByPlan(null);
            }
        } else {
            req.tenant = null;
            res.locals.allowedByPlan = getAllowedByPlan(null);
        }
        return next();
    }
    return attachTenantContext(req, res, next);
}

module.exports = {
    attachTenantContext,
    costeoTenantContext
};
