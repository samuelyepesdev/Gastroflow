const LandingSettingsService = require('../../../services/Admin/LandingSettingsService');

class HomeController {
    /**
     * GET /
     * Redirección inicial según el rol del usuario
     */
    static async index(req, res) {
        if (!req.user) {
            try {
                const settings = await LandingSettingsService.getAll();
                return res.render('landing/index', { settings });
            } catch (error) {
                console.error('Error fetching landing settings in HomeController:', error);
                return res.render('landing/index', { settings: {} });
            }
        }

        const rol = String(req.user.rol || '').toLowerCase();

        switch (rol) {
            case 'superadmin':
                return res.redirect('/admin/dashboard');
            case 'admin':
                return res.redirect('/dashboard');
            case 'mesero':
                return res.redirect('/mesas');
            case 'cocinero':
                return res.redirect('/cocina');
            case 'cajero':
                return res.redirect('/ventas');
            default:
                return res.redirect('/mesas');
        }
    }
}

module.exports = HomeController;
