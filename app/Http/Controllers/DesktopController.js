/**
 * DesktopController - Primera vinculación del prototipo de escritorio con
 * producción: login con las credenciales reales del tenant + pull inicial
 * de catálogo. Solo tiene sentido cuando este proceso corre en modo desktop
 * (SYNC_API_URL seteado); en producción normal las rutas redirigen al login
 * normal sin hacer nada.
 */

const DesktopSyncService = require('../../../services/Shared/DesktopSyncService');

class DesktopController {
    static showLink(req, res) {
        if (!DesktopSyncService.isDesktopMode()) {
            return res.redirect('/auth/login');
        }
        res.render('desktop/link', { error: null });
    }

    static async link(req, res) {
        if (!DesktopSyncService.isDesktopMode()) {
            return res.redirect('/auth/login');
        }

        const { username, password } = req.body || {};
        if (!username || !password) {
            return res.render('desktop/link', { error: 'Usuario y contraseña son requeridos' });
        }

        let sessionSaved = false;
        try {
            await DesktopSyncService.loginAndSaveToken(username, password);
            sessionSaved = true;
            // Pull inmediato (no esperar el próximo tick del cron): así el
            // usuario ya encuentra su usuario/mesas/productos reales al
            // llegar a la pantalla de login local.
            await DesktopSyncService.pullFromProduction();
            res.redirect('/auth/login');
        } catch (error) {
            if (sessionSaved) {
                // El login contra producción sí funcionó, pero el pull falló
                // a mitad de camino. Sin esto, el archivo de sesión ya
                // guardado hace que electron/main.js "crea" que este equipo
                // ya se vinculó (initialPath se decide solo por si ese
                // archivo existe) y en el próximo arranque salte directo al
                // login local con la BD local todavía vacía.
                await DesktopSyncService.clearSession().catch(() => {});
            }
            res.render('desktop/link', { error: error.message });
        }
    }
}

module.exports = DesktopController;
