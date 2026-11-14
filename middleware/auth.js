const authService = require('../services/Shared/AuthService');
const { PERMISSIONS, ROLES } = require('../utils/constants');

/**
 * Middleware to verify JWT token from Authorization header or cookie
 * Attaches user data to req.user if valid
 */
function requireAuth(req, res, next) {
    let token = null;

    // Try to get token from Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
    }

    // Try to get token from cookie
    if (!token && req.cookies) {
        token = req.cookies.auth_token;
    }

    // El token NO se acepta por query string: queda en logs de acceso, historial y cabecera Referer.

    if (!token) {
        if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
            return res.status(401).json({ error: 'No autorizado. Token requerido' });
        }
        return res.redirect('/auth/login');
    }

    // Verify token
    const decoded = authService.verifyToken(token);
    if (!decoded) {
        if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
            return res.status(401).json({ error: 'Token inválido o expirado' });
        }
        return res.redirect('/auth/login');
    }

    // Attach user data to request
    req.user = decoded;
    next();
}

/**
 * Middleware to require specific role(s)
 * Must be used after requireAuth
 */
function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'No autenticado' });
        }

        if (!authService.hasRole(req.user.rol, allowedRoles)) {
            if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
                return res.status(403).json({ error: 'No tiene permisos para acceder a este recurso' });
            }
            return res.status(403).render('errors/generic', {
                error: { message: 'No tiene permisos para acceder a esta página' }
            });
        }

        next();
    };
}

/**
 * Middleware to require specific permission(s)
 * Must be used after requireAuth
 */
function requirePermission(...requiredPermissions) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'No autenticado' });
        }

        const userPermissions = req.user.permisos || [];
        const hasAnyPermission = requiredPermissions.some(permission =>
            authService.hasPermission(userPermissions, permission)
        );

        if (!hasAnyPermission) {
            if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
                return res.status(403).json({ error: 'No tiene permisos para realizar esta acción' });
            }
            return res.status(403).render('errors/generic', {
                error: { message: 'No tiene permisos para realizar esta acción' }
            });
        }

        next();
    };
}

/**
 * Exige permisos distintos según el método HTTP, para proteger un módulo entero desde su montaje:
 *   - lectura (GET/HEAD): basta con CUALQUIERA de `ver`.
 *   - escritura (resto): basta con CUALQUIERA de `editar`; si `editar` no se pasa, no se exige nada
 *     (las rutas de escritura ya llevan su propio requirePermission).
 * El superadmin pasa siempre: solo llega a los módulos que `restrictSuperadminToAdmin` le permite
 * (hoy /costeo) y su JWT no depende de las filas rol_permisos de ningún tenant.
 * Debe ir después de requireAuth.
 */
function requirePermissionByMethod({ ver = [], editar = [] }) {
    return (req, res, next) => {
        if (req.user && String(req.user.rol || '').toLowerCase() === 'superadmin') {
            return next();
        }
        const esLectura = req.method === 'GET' || req.method === 'HEAD';
        const requeridos = esLectura ? ver : editar;
        if (requeridos.length === 0) {
            return next();
        }
        return requirePermission(...requeridos)(req, res, next);
    };
}

/**
 * Restrict superadmin to only /admin/tenants, /admin/sistema and /costeo (and auth). Use after requireAuth on app routes.
 * Superadmin must not see dashboard, mesas, etc.
 */
function restrictSuperadminToAdmin(req, res, next) {
    const rol = req.user && String(req.user.rol || '').toLowerCase();
    if (rol === 'superadmin') {
        const path = (req.baseUrl || '') + (req.path || '');
        const allowed =
            path.startsWith('/admin/tenants') ||
            path.startsWith('/admin/onboarding') ||
            path.startsWith('/admin/dashboard') ||
            path.startsWith('/admin/sistema') ||
            path.startsWith('/admin/planes') ||
            path.startsWith('/admin/permisos') ||
            path.startsWith('/admin/ventas') ||
            path.startsWith('/admin/landing') ||
            path.startsWith('/admin/reportes') ||
            path.startsWith('/admin/soporte') ||
            path.startsWith('/admin/jobs') ||
            path.startsWith('/costeo') ||
            path === '/auth/logout';
        if (!allowed) {
            if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
                return res
                    .status(403)
                    .json({ error: 'Acceso restringido. Solo gestión de restaurantes, landing page y costeo.' });
            }
            return res.redirect('/admin/dashboard');
        }
    }
    next();
}

/**
 * Guard for the self-service onboarding flow (crear local).
 * Must be used after requireAuth. Only lets through users without a tenant yet
 * (recién verificados, pendientes de crear su local); if the user already has
 * a tenant, sends them back to '/' instead.
 */
function requireOnboarding(req, res, next) {
    if (!req.user) {
        return res.redirect('/auth/login');
    }
    if (req.user.tenant_id !== null && req.user.tenant_id !== undefined) {
        return res.redirect('/');
    }
    next();
}

/**
 * Optional auth middleware - attaches user if token exists, but doesn't require it
 */
function optionalAuth(req, res, next) {
    let token = null;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
    }

    if (!token && req.cookies) {
        token = req.cookies.auth_token;
    }

    if (token) {
        const decoded = authService.verifyToken(token);
        if (decoded) {
            req.user = decoded;
        }
    }

    next();
}

module.exports = {
    requireAuth,
    requireRole,
    requirePermission,
    requirePermissionByMethod,
    restrictSuperadminToAdmin,
    requireOnboarding,
    optionalAuth
};
