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

        try {
            await DesktopSyncService.loginAndSaveToken(username, password);
            // Pull inmediato (no esperar el próximo tick del cron): así el
            // usuario ya encuentra su usuario/mesas/productos reales al
            // llegar a la pantalla de login local.
            await DesktopSyncService.pullFromProduction();
            res.redirect('/auth/login');
        } catch (error) {
            res.render('desktop/link', { error: error.message });
        }
    }
}

module.exports = DesktopController;
