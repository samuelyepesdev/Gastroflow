const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../../config/database');
const { JWT_CONFIG } = require('../../utils/constants');
const logger = require('../../utils/logger');
const CacheService = require('./CacheService');
const PermisosUsuarioService = require('./PermisosUsuarioService');

// Authentication service
// Handles user authentication, token generation and password management

/**
 * Devuelve el conjunto completo de roles de un usuario (rol principal +
 * adicionales en usuario_roles), sin duplicados. El rol principal siempre
 * queda incluido aunque falte en usuario_roles (usuarios creados antes de
 * la migración 079, o si la fila se borró por error).
 * @param {number} userId - User ID
 * @param {number} rolIdPrincipal - usuarios.rol_id
 * @param {string} rolNombrePrincipal - Nombre del rol principal
 * @returns {Promise<{ids: number[], names: string[]}>}
 */
async function getUserRoleIdsAndNames(userId, rolIdPrincipal, rolNombrePrincipal) {
    const [rows] = await db
        .query(
            `
            SELECT r.id, r.nombre FROM roles r
            INNER JOIN usuario_roles ur ON ur.rol_id = r.id
            WHERE ur.user_id = ?
        `,
            [userId]
        )
        .catch(() => [[]]);

    const ids = new Set([rolIdPrincipal]);
    const names = new Set([rolNombrePrincipal]);
    (rows || []).forEach(r => {
        ids.add(r.id);
        names.add(r.nombre);
    });

    return { ids: [...ids], names: [...names] };
}

/**
 * Authenticate user with username and password
 * @param {string} username - Username
 * @param {string} password - Plain text password
 * @returns {Promise<Object>} User object with token or null if invalid
 */
async function authenticateUser(username, password) {
    try {
        // Get user with role and permissions (incl. tenant_id for multi-tenancy)
        const [users] = await db.query(
            `
            SELECT u.*, r.nombre AS rol_nombre, r.descripcion AS rol_descripcion,
                   pl.slug AS plan_slug
            FROM usuarios u
            INNER JOIN roles r ON u.rol_id = r.id
            LEFT JOIN tenants t ON u.tenant_id = t.id
            LEFT JOIN planes pl ON t.plan_id = pl.id
            WHERE u.username = ? AND u.activo = TRUE
        `,
            [username]
        );

        if (users.length === 0) {
            return { success: false, message: 'Usuario o contraseña incorrectos' };
        }

        const user = users[0];

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            return { success: false, message: 'Usuario o contraseña incorrectos' };
        }

        const userRoles = await getUserRoleIdsAndNames(user.id, user.rol_id, user.rol_nombre);

        // Permisos efectivos: rol + concedidos - denegados (y techo del plan para el admin del restaurante)
        const resuelto = await PermisosUsuarioService.resolver(user.id, {
            rolIds: userRoles.ids,
            rolNombre: user.rol_nombre,
            tenantId: user.tenant_id
        });
        const userPermissions = resuelto ? resuelto.permisos : [];

        // Generate JWT token (include tenant_id for multi-tenancy)
        const token = generateToken({
            id: user.id,
            username: user.username,
            rol: user.rol_nombre,
            roles: userRoles.names,
            permisos: userPermissions,
            tenant_id: user.tenant_id
        });

        // Return user data without password
        return {
            success: true,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                nombre_completo: user.nombre_completo,
                rol: user.rol_nombre,
                roles: userRoles.names,
                permisos: userPermissions,
                tenant_id: user.tenant_id
            },
            token
        };
    } catch (error) {
        logger.error('Error in authenticateUser', { error: error.message, stack: error.stack });
        throw new Error('Error al autenticar usuario', { cause: error });
    }
}

/**
 * Generate JWT token
 * @param {Object} payload - Token payload
 * @returns {string} JWT token
 */
function generateToken(payload) {
    return jwt.sign(payload, JWT_CONFIG.SECRET, {
        expiresIn: JWT_CONFIG.EXPIRES_IN
    });
}

/**
 * Token de sesión de un usuario ya cargado (getUserById) para un tenant dado. Lo usan el cambio
 * de contexto (entrar a una sucursal / volver al principal): el usuario es el mismo, solo cambia
 * el tenant_id del JWT.
 * @param {Object} usuario - Resultado de getUserById
 * @param {number} tenantId
 */
function emitirSesion(usuario, tenantId) {
    return generateToken({
        id: usuario.id,
        username: usuario.username,
        rol: usuario.rol,
        roles: usuario.roles,
        permisos: usuario.permisos,
        tenant_id: tenantId
    });
}

/**
 * Verify JWT token
 * @param {string} token - JWT token
 * @returns {Object} Decoded token payload or null if invalid
 */
function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_CONFIG.SECRET);
    } catch (_error) {
        return null;
    }
}

/**
 * Get user by ID with role and permissions
 * @param {number} userId - User ID
 * @returns {Promise<Object|null>} User object or null
 */
async function getUserById(userId) {
    try {
        const [users] = await db.query(
            `
            SELECT u.id, u.username, u.email, u.nombre_completo, u.rol_id, u.tenant_id, u.debe_cambiar_password,
                   r.nombre AS rol_nombre, r.descripcion AS rol_descripcion,
                   pl.slug AS plan_slug
            FROM usuarios u
            INNER JOIN roles r ON u.rol_id = r.id
            LEFT JOIN tenants t ON u.tenant_id = t.id
            LEFT JOIN planes pl ON t.plan_id = pl.id
            WHERE u.id = ? AND u.activo = TRUE
        `,
            [userId]
        );

        if (users.length === 0) {
            return null;
        }

        const user = users[0];

        const userRoles = await getUserRoleIdsAndNames(user.id, user.rol_id, user.rol_nombre);

        const resuelto = await PermisosUsuarioService.resolver(user.id, {
            rolIds: userRoles.ids,
            rolNombre: user.rol_nombre,
            tenantId: user.tenant_id
        });
        const permisos = resuelto ? resuelto.permisos : [];

        return {
            id: user.id,
            username: user.username,
            email: user.email,
            nombre_completo: user.nombre_completo,
            rol: user.rol_nombre,
            roles: userRoles.names,
            permisos,
            tenant_id: user.tenant_id,
            debe_cambiar_password: Boolean(user.debe_cambiar_password)
        };
    } catch (error) {
        logger.error('Error in getUserById', { error: error.message, userId });
        return null;
    }
}

/**
 * Hash password using bcrypt
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password
 */
async function hashPassword(password) {
    const saltRounds = 10;
    return await bcrypt.hash(password, saltRounds);
}

/**
 * Check if user has permission
 * @param {Array<string>} userPermissions - User permissions array
 * @param {string} requiredPermission - Required permission
 * @returns {boolean} True if user has permission
 */
function hasPermission(userPermissions, requiredPermission) {
    if (!userPermissions || !Array.isArray(userPermissions)) {
        return false;
    }
    return userPermissions.includes(requiredPermission);
}

/**
 * Check if user has any of the required roles
 * @param {string} userRole - User role
 * @param {Array<string>} requiredRoles - Required roles array
 * @returns {boolean} True if user has one of the required roles
 */
function hasRole(userRole, requiredRoles) {
    if (!userRole || !requiredRoles || !Array.isArray(requiredRoles)) {
        return false;
    }
    const roleLower = String(userRole).toLowerCase();
    return requiredRoles.some(r => String(r).toLowerCase() === roleLower);
}

/**
 * Change password for the current user (verify current, set new).
 * @param {number} userId - User ID (must be the logged-in user)
 * @param {string} currentPassword - Current plain password
 * @param {string} newPassword - New plain password
 * @returns {Promise<{ success: boolean, message?: string }>}
 */
async function changePassword(userId, currentPassword, newPassword) {
    if (!userId || !currentPassword || !newPassword) {
        return { success: false, message: 'Contraseña actual y nueva son requeridas.' };
    }
    if (newPassword.length < 8) {
        return { success: false, message: 'La nueva contraseña debe tener al menos 8 caracteres.' };
    }
    try {
        const [users] = await db.query('SELECT id, password_hash FROM usuarios WHERE id = ? AND activo = TRUE', [
            userId
        ]);
        if (users.length === 0) {
            return { success: false, message: 'Usuario no encontrado.' };
        }
        const user = users[0];
        const valid = await bcrypt.compare(currentPassword, user.password_hash);
        if (!valid) {
            return { success: false, message: 'Contraseña actual incorrecta.' };
        }
        if (currentPassword === newPassword) {
            return { success: false, message: 'La nueva contraseña debe ser distinta a la actual.' };
        }
        const newHash = await hashPassword(newPassword);
        await db.query('UPDATE usuarios SET password_hash = ?, debe_cambiar_password = 0 WHERE id = ?', [
            newHash,
            userId
        ]);
        // El contexto cacheado del usuario aún trae debe_cambiar_password = 1 hasta 45 s
        CacheService.delete(`user:ctx:${userId}`);
        return { success: true };
    } catch (error) {
        logger.error('Error in changePassword', { error: error.message, userId });
        return { success: false, message: 'Error al cambiar la contraseña.' };
    }
}

module.exports = {
    authenticateUser,
    generateToken,
    emitirSesion,
    verifyToken,
    getUserById,
    hashPassword,
    hasPermission,
    hasRole,
    changePassword
};
