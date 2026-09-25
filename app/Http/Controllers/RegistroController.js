const RegistroService = require('../../../services/Shared/RegistroService');
const authService = require('../../../services/Shared/AuthService');
const { validationResult } = require('express-validator');
const logger = require('../../../utils/logger');
const { getClientIp } = require('../../../utils/clientIp');

class RegistroController {
    // GET /auth/registro
    static async showRegistro(req, res) {
        res.render('auth/registro', { title: 'Crear cuenta' });
    }

    // POST /auth/registro
    static async registrar(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ error: errors.array()[0].msg, details: errors.array() });
            }

            const { nombre_completo, username, email, password } = req.body;
            await RegistroService.registrar({ nombre_completo, username, email, password });

            logger.audit('registro.creado', { username, email, ip: getClientIp(req) });

            res.status(201).json({
                success: true,
                message: 'Cuenta creada. Revisa tu correo para verificar tu cuenta.'
            });
        } catch (error) {
            logger.error('Error en registro público', { error: error.message });
            res.status(400).json({ error: error.message || 'No se pudo crear la cuenta' });
        }
    }

    // GET /auth/verificar-email/:token
    static async verificarEmail(req, res) {
        try {
            const usuario = await RegistroService.verificarEmail(req.params.token);
            if (!usuario) {
                return res.render('auth/verificar-email', {
                    title: 'Verificar correo',
                    ok: false
                });
            }

            const token = authService.generateToken({
                id: usuario.id,
                username: usuario.username,
                rol: 'propietario_pendiente',
                roles: ['propietario_pendiente'],
                permisos: [],
                tenant_id: null
            });

            res.cookie('auth_token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 24 * 60 * 60 * 1000
            });

            logger.audit('registro.email_verificado', {
                userId: usuario.id,
                username: usuario.username,
                ip: getClientIp(req)
            });

            res.redirect('/onboarding/crear-local');
        } catch (error) {
            logger.error('Error al verificar email', { error: error.message });
            res.render('auth/verificar-email', { title: 'Verificar correo', ok: false });
        }
    }

    // POST /auth/reenviar-verificacion
    static async reenviarVerificacion(req, res) {
        try {
            const { email } = req.body;
            if (email) {
                await RegistroService.reenviarVerificacion(email);
            }
            // Respuesta genérica: no confirmamos si el correo existe o no.
            res.json({ success: true, message: 'Si el correo existe y está pendiente, te reenviamos el link.' });
        } catch (error) {
            logger.error('Error al reenviar verificación', { error: error.message });
            res.status(400).json({ error: 'No se pudo reenviar el correo' });
        }
    }
}

module.exports = RegistroController;
