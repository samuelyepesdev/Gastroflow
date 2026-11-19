/**
 * Tenant middleware - Attaches tenant context after authentication.
 * Must run after requireAuth. Validates tenant exists and is active.
 * Sets req.tenant and req.user.tenant_id for use in services/repos.
 */

const TenantRepository = require('../repositories/Admin/TenantRepository');
const AddonRepository = require('../repositories/Admin/AddonRepository');
const AuthService = require('../services/Shared/AuthService');
const CacheService = require('../services/Shared/CacheService');
const {
    getAllowedByPlan,
    getAllowedForUser,
    planHasModule,
    PERMISSION_TO_MODULE
} = require('../utils/planPermissions');
const { getTenantBlockedMessage, getBloqueoPorPadre } = require('../utils/tenantMessages');

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

        // Un dueño que aún no tiene local (registro público) no pertenece a ningún tenant: nunca
        // debe caer en el tenant por defecto de abajo, o leería datos del tenant "principal".
        // Su único destino es /onboarding (que no pasa por este middleware).
        if (rol === 'propietario_pendiente') {
            if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
                return res.status(403).json({ error: 'Debes crear tu local antes de usar esta función' });
            }
            return res.redirect('/onboarding/crear-local');
        }

        let usuarioFresco = null;
        if (rol !== 'superadmin' && req.user.id) {
            const userCacheKey = `user:ctx:${req.user.id}`;
            let freshUser = CacheService.get(userCacheKey);
            if (!freshUser) {
                freshUser = await AuthService.getUserById(req.user.id);
                if (freshUser) {
                    CacheService.set(userCacheKey, freshUser, CONTEXT_TTL_SECONDS);
                }
            }
            usuarioFresco = freshUser;
            // getUserById solo devuelve usuarios activos: null = desactivado o eliminado. El JWT
            // sigue siendo válido hasta 24h, así que sin este rechazo un empleado dado de baja
            // conservaría acceso.
            if (!freshUser) {
                res.clearCookie('auth_token');
                if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
                    return res.status(401).json({ error: 'Sesión no válida', redirect: '/auth/login' });
                }
                return res.redirect('/auth/login?mensaje=' + encodeURIComponent('Tu sesión ya no es válida.'));
            }
            // Contraseña temporal (admin de una sucursal nueva o reseteada por su padre): no usa
            // ningún módulo hasta cambiarla. /auth/cambiar-password no pasa por este middleware.
            if (freshUser.debe_cambiar_password) {
                const destino = '/auth/cambiar-password?obligatorio=1';
                if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
                    return res
                        .status(403)
                        .json({ error: 'Debes cambiar tu contraseña para continuar', redirect: destino });
                }
                return res.redirect(destino);
            }
            if (Array.isArray(freshUser.permisos)) {
                req.user.permisos = freshUser.permisos;
            }
            // Preferencia visual del menú (no afecta permisos): la usa navbarLocals.
            req.user.nav_oculto = Array.isArray(freshUser.nav_oculto) ? freshUser.nav_oculto : [];
            // El rol sale de la BD, no del JWT: un cambio de rol aplica de inmediato.
            if (freshUser.rol) {
                req.user.rol = freshUser.rol;
                req.user.roles = freshUser.roles;
            }
        }

        let tenantId = req.user.tenant_id;
        const tenantIdDelToken = tenantId;

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

        // Contexto de sucursal: el admin del restaurante padre entra a una sucursal con su mismo
        // usuario y el JWT trae el tenant de la sucursal. Solo vale si esa sucursal es HIJA del
        // tenant de origen guardado en la BD (no el que afirma el token); cualquier otro tenant
        // distinto al propio se rechaza.
        let contextoSucursal = null;
        if (
            usuarioFresco &&
            tenantIdDelToken !== null &&
            tenantIdDelToken !== undefined &&
            usuarioFresco.tenant_id !== null &&
            usuarioFresco.tenant_id !== undefined &&
            Number(tenantIdDelToken) !== Number(usuarioFresco.tenant_id)
        ) {
            if (Number(cachedTenant.tenant_padre_id) !== Number(usuarioFresco.tenant_id)) {
                res.clearCookie('auth_token');
                if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
                    return res
                        .status(403)
                        .json({ error: 'Sesión no válida para este restaurante', redirect: '/auth/login' });
                }
                return res.redirect(
                    '/auth/login?mensaje=' + encodeURIComponent('Tu sesión no es válida para este restaurante.')
                );
            }
            const principal = await getCachedTenant(usuarioFresco.tenant_id);
            contextoSucursal = { principalNombre: principal?.nombre || '' };
        }

        // Inactivo por sí mismo, o sucursal cuyo restaurante padre está desactivado/suspendido.
        const msgBloqueo = !cachedTenant.activo
            ? getTenantBlockedMessage(cachedTenant)
            : await getBloqueoPorPadre(cachedTenant, getCachedTenant);
        if (msgBloqueo) {
            res.clearCookie('auth_token');
            if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
                return res.status(403).json({ error: msgBloqueo, redirect: '/auth/login' });
            }
            return res.redirect('/auth/login?mensaje=' + encodeURIComponent(msgBloqueo));
        }

        // addonSlugs es a nivel tenant (mismo valor para cualquier request de ese tenant),
        // así que mutar el objeto cacheado es seguro: requests concurrentes calculan el
        // mismo valor y no se pisan entre sí.
        const tenant = cachedTenant;
        tenant.addonSlugs = await getAddonSlugs(tenant.id);

        if (contextoSucursal) {
            // Los permisos del usuario se calculan con el plan de SU restaurante; en la sucursal
            // solo valen los de módulos que el plan (o add-ons) de la sucursal incluye.
            // Copia nueva: req.user.permisos es el arreglo cacheado compartido.
            req.user.permisos = (req.user.permisos || []).filter(p => {
                const modulo = PERMISSION_TO_MODULE[p];
                return !modulo || planHasModule(tenant.plan || null, modulo, tenant.addonSlugs);
            });
            req.contextoSucursal = contextoSucursal;
            res.locals.contextoSucursal = { nombre: tenant.nombre, principalNombre: contextoSucursal.principalNombre };
        }

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
