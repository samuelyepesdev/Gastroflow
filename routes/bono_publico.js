const express = require('express');
const { keyPorIp } = require('../utils/rateLimitKey');
const rateLimit = require('express-rate-limit');
const BonoPublicoController = require('../app/Http/Controllers/Public/BonoPublicoController');

const router = express.Router();

// Página pública sin login: el token es aleatorio de 96 bits, pero igual se limita por IP
// para que nadie pueda probar tokens en masa.
const bonoPublicoLimiter = rateLimit({
    keyGenerator: keyPorIp,
    windowMs: 10 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Demasiadas consultas. Espera unos minutos e intenta de nuevo.'
});

// Rutas base: /bono
router.get('/:token', bonoPublicoLimiter, BonoPublicoController.show);

module.exports = router;
