const express = require('express');
const bloquearLogoutCrossSite = require('../middleware/bloquearLogoutCrossSite');
const { keyPorIp } = require('../utils/rateLimitKey');
const router = express.Router();
const AuthController = require('../app/Http/Controllers/AuthController');
const RegistroController = require('../app/Http/Controllers/RegistroController');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const BaseRequest = require('../app/Http/Requests/BaseRequest');
const LoginRequest = require('../app/Http/Requests/Auth/LoginRequest');
const ChangePasswordRequest = require('../app/Http/Requests/Auth/ChangePasswordRequest');
const RegisterRequest = require('../app/Http/Requests/Auth/RegisterRequest');

const rateLimit = require('express-rate-limit');

// Bloquear ataques de fuerza bruta al login (máx 5 intentos / 15 min)
const loginLimiter = rateLimit({
    keyGenerator: keyPorIp,
    windowMs: 1 * 60 * 1000,
    max: 5,
    message: { error: 'Demasiados intentos de inicio de sesión fallidos, por favor intente de nuevo en 3 minutos.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Limitar registros y reenvíos de verificación (evitar spam de correos)
const registroLimiter = rateLimit({
    keyGenerator: keyPorIp,
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: { error: 'Demasiados intentos de registro, por favor intenta de nuevo en una hora.' },
    standardHeaders: true,
    legacyHeaders: false
});

// GET /auth/login - Vista
router.get('/login', optionalAuth, AuthController.showLogin);

// POST /auth/login - Logic
router.post('/login', loginLimiter, BaseRequest.validate(LoginRequest), AuthController.login);

// GET /auth/registro - Vista
router.get('/registro', RegistroController.showRegistro);

// POST /auth/registro - Logic
router.post('/registro', registroLimiter, BaseRequest.validate(RegisterRequest), RegistroController.registrar);

// GET /auth/verificar-email/:token - Verifica el correo y redirige a onboarding
router.get('/verificar-email/:token', RegistroController.verificarEmail);

// POST /auth/reenviar-verificacion - Reenvía el link de verificación
router.post('/reenviar-verificacion', registroLimiter, RegistroController.reenviarVerificacion);

// GET /auth/logout - Redirect
router.get('/logout', bloquearLogoutCrossSite, AuthController.logout);

// POST /auth/logout - API
router.post('/logout', AuthController.logoutPost);

// POST /auth/volver-principal - Salir del contexto de una sucursal
router.post('/volver-principal', requireAuth, AuthController.volverPrincipal);

// GET /auth/me - Profile API
router.get('/me', requireAuth, AuthController.me);

// GET /auth/cambiar-password - Vista
router.get('/cambiar-password', requireAuth, AuthController.showChangePassword);

// POST /auth/cambiar-password - Logic
router.post(
    '/cambiar-password',
    requireAuth,
    BaseRequest.validate(ChangePasswordRequest),
    AuthController.changePassword
);

module.exports = router;
