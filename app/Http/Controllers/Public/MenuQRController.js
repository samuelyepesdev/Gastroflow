const MenuQRService = require('../../../../services/Public/MenuQRService');

class MenuQRController {
    static async showMenu(req, res) {
        try {
            const { tenantSlug, qrToken } = req.params;

            // Delegar toda la carga de datos al Service
            const data = await MenuQRService.getMenuData(tenantSlug, qrToken);

            // Establecer cookie de sesión QR (expira en 3 horas)
            res.cookie(`qr_session_${data.mesa.id}`, data.mesa.qr_session_id, {
                maxAge: 3 * 60 * 60 * 1000,
                httpOnly: true,
                path: '/'
            });

            // Renderizar Vista Móvil
            res.render('qr/menu', {
                tenant: data.tenant,
                mesa: data.mesa,
                categorias: data.categorias,
                modificadores: data.modificadores || {},
                qrToken,
                qrSessionId: data.mesa.qr_session_id
            });

        } catch (error) {
            console.error('Error en MenuQRController:', error);
            
            if (error.status === 404) {
                return res.status(404).render('errors/404', { message: error.message });
            }

            res.status(500).render('errors/internal', {
                error: { message: 'Error al cargar el menú QR', stack: process.env.NODE_ENV === 'development' ? error.stack : '' }
            });
        }
    }
}

module.exports = MenuQRController;
