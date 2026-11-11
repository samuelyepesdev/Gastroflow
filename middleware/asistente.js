const authService = require('../services/Shared/AuthService');
const { asistenteConfigurado } = require('../services/Tenant/Asistente/llm');

const ADDON = 'asistente';
const PERMISO = 'asistente.usar';

/**
 * Acceso al asistente Chef, en tres capas que deben cumplirse a la vez:
 *   1. El restaurante tiene el add-on `asistente`. Se mira tenant_addons directamente: los planes
 *      Premium/Definitivo traen todos los módulos y su admin recibiría el permiso sin haber pagado el add-on.
 *   2. El usuario tiene el permiso `asistente.usar` (lo concede el superadmin como excepción por usuario).
 *   3. El servidor tiene la clave del proveedor de IA (se comprueba al final para no revelar la
 *      configuración a quien no tiene acceso).
 * Debe ir después de requireAuth y attachTenantContext.
 */
function requireAsistente(req, res, next) {
    if (!req.user || !req.tenant) {
        return res.status(401).json({ error: 'No autenticado' });
    }
    const addons = req.tenant.addonSlugs;
    if (!Array.isArray(addons) || !addons.includes(ADDON)) {
        return res.status(403).json({ error: 'El asistente no está habilitado para este restaurante.' });
    }
    if (!authService.hasPermission(req.user.permisos, PERMISO)) {
        return res.status(403).json({ error: 'No tienes acceso al asistente.' });
    }
    if (!asistenteConfigurado()) {
        return res.status(503).json({ error: 'El asistente no está configurado.' });
    }
    next();
}

/** Solo la clave del proveedor: para el asistente del superadmin, que no depende de add-on ni de restaurante. */
function requireProveedorIA(req, res, next) {
    if (!asistenteConfigurado()) {
        return res
            .status(503)
            .json({ tipo: 'error', codigo: 'no_configurado', texto: 'El asistente no está configurado.' });
    }
    next();
}

module.exports = { requireAsistente, requireProveedorIA };
