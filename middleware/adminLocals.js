/**
 * adminLocals.js
 * Middleware exclusivo del panel superadmin: expone en res.locals la
 * información que consume el sidebar (views/admin/_shell/_sidebar.ejs):
 *   - adminSections / adminQuickLinks: estructura del menú (utils/adminSections.js)
 *   - adminBadges: contadores tipo badge (ej. tickets de soporte abiertos)
 *
 * A diferencia de navbarLocals.js (getter lazy, todo síncrono), adminBadges
 * requiere una query a la base de datos, y EJS no puede esperar una promesa
 * dentro de un getter, así que la query se resuelve ANTES de next().
 */

const db = require('../config/database');
const { asistenteConfigurado } = require('../services/Tenant/Asistente/llm');
const { ADMIN_SECTIONS, ADMIN_QUICK_LINKS } = require('../utils/adminSections');

module.exports = async function adminLocals(req, res, next) {
    res.locals.adminSections = ADMIN_SECTIONS;
    res.locals.adminQuickLinks = ADMIN_QUICK_LINKS;

    let soporteAbiertos = null;
    try {
        const [[row]] = await db.query("SELECT COUNT(*) AS c FROM soporte_tickets WHERE estado = 'abierto'");
        soporteAbiertos = row && row.c > 0 ? row.c : null;
    } catch (error) {
        console.error('Error obteniendo contador de tickets de soporte:', error);
    }

    let onboardingPendientes = null;
    try {
        const [[row]] = await db.query(
            `SELECT
                (SELECT COUNT(*) FROM tenants WHERE estado_aprobacion = 'pendiente') +
                (SELECT COUNT(*) FROM usuarios WHERE tenant_id IS NULL AND rol_id = (SELECT id FROM roles WHERE nombre = 'propietario_pendiente')) AS c`
        );
        onboardingPendientes = row && row.c > 0 ? row.c : null;
    } catch (error) {
        console.error('Error obteniendo contador de onboarding pendiente:', error);
    }

    res.locals.adminBadges = { soporteAbiertos, onboardingPendientes };
    // El panel del asistente del sistema solo aparece si el servidor tiene la clave del proveedor de IA.
    res.locals.asistenteSistema = asistenteConfigurado();

    next();
};
