const OnboardingService = require('../../../services/Shared/OnboardingService');
const authService = require('../../../services/Shared/AuthService');
const logger = require('../../../utils/logger');
const { getClientIp } = require('../../../utils/clientIp');

class OnboardingController {
    // GET /onboarding/crear-local
    static async showCrearLocal(req, res) {
        res.render('onboarding/crear-local', { title: 'Crea tu local', user: req.user });
    }

    // POST /onboarding/crear-local
    static async crearLocal(req, res) {
        try {
            const { nombre, tipo_negocio, ciudad, telefono, nit, direccion } = req.body;
            const tenant = await OnboardingService.crearLocal(req.user.id, {
                nombre,
                tipo_negocio,
                ciudad,
                telefono,
                nit,
                direccion
            });

            logger.audit('onboarding.local_creado', {
                userId: req.user.id,
                tenantId: tenant.id,
                slug: tenant.slug,
                ip: getClientIp(req)
            });

            // El JWT en cookie todavía tiene tenant_id=null / rol pendiente; se
            // reemite ya con el tenant nuevo para que el resto de la app (y un
            // futuro refresh) lo reconozca sin tener que loguearse de nuevo.
            const token = authService.generateToken({
                id: req.user.id,
                username: req.user.username,
                rol: 'admin',
                roles: ['admin'],
                permisos: [],
                tenant_id: tenant.id
            });
            res.cookie('auth_token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 24 * 60 * 60 * 1000
            });

            res.status(201).json({ success: true, redirect: '/onboarding/pendiente' });
        } catch (error) {
            logger.error('Error al crear local en onboarding', { error: error.message, userId: req.user?.id });
            res.status(400).json({ error: error.message || 'No se pudo crear el local' });
        }
    }

    // GET /onboarding/pendiente
    static async showPendiente(req, res) {
        res.render('onboarding/pendiente', { title: 'Local en revisión', user: req.user });
    }
}

module.exports = OnboardingController;
