const LandingSettingsService = require('../../../../services/Admin/LandingSettingsService');

class LandingController {
    /**
     * Render the landing page settings editor backoffice UI.
     */
    static async index(req, res) {
        try {
            const settings = await LandingSettingsService.getAll();
            res.render('admin/landing/editor', {
                user: req.user,
                settings,
                currentAdminPage: 'landing',
                success: req.query.success === 'true',
                error: req.query.error || null
            });
        } catch (error) {
            console.error('Error rendering landing editor:', error);
            res.status(500).render('errors/generic', {
                error: { message: 'Error al cargar el editor de la landing page' }
            });
        }
    }

    /**
     * Update the landing page settings and redirect back to the editor.
     */
    static async update(req, res) {
        try {
            const settingsToUpdate = { ...req.body };
            delete settingsToUpdate._csrf;

            await LandingSettingsService.update(settingsToUpdate);

            res.redirect('/admin/landing?success=true');
        } catch (error) {
            console.error('Error updating landing settings:', error);
            res.redirect(`/admin/landing?error=${encodeURIComponent('Error al guardar la configuración')}`);
        }
    }
}

module.exports = LandingController;
