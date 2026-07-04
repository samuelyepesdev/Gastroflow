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

    // Try to get token from query parameter (for API calls)
    if (!token && req.query.token) {
        token = req.query.token;
    }

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
 * Restrict superadmin to only /admin/tenants, /admin/sistema and /costeo (and auth). Use after requireAuth on app routes.
 * Superadmin must not see dashboard, mesas, etc.
 */
function restrictSuperadminToAdmin(req, res, next) {
    const rol = req.user && String(req.user.rol || '').toLowerCase();
    if (rol === 'superadmin') {
        const path = (req.baseUrl || '') + (req.path || '');
        const allowed =
            path.startsWith('/admin/tenants') ||
            path.startsWith('/admin/dashboard') ||
            path.startsWith('/admin/sistema') ||
            path.startsWith('/admin/planes') ||
            path.startsWith('/admin/permisos') ||
            path.startsWith('/admin/ventas') ||
            path.startsWith('/admin/landing') ||
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
    restrictSuperadminToAdmin,
    optionalAuth
};
