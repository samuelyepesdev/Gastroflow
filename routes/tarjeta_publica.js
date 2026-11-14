const express = require('express');
const { keyPorIp } = require('../utils/rateLimitKey');
const rateLimit = require('express-rate-limit');
const TarjetaPublicaController = require('../app/Http/Controllers/Public/TarjetaPublicaController');

const router = express.Router();

// Sin login: el token es aleatorio (144 bits) y además se limita por IP.
const limitador = rateLimit({
    keyGenerator: keyPorIp,
    windowMs: 10 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Demasiadas consultas. Espera unos minutos e intenta de nuevo.'
});

// El alta es más estricta: crea registros, así que se limita mucho más por IP.
const limitadorAlta = rateLimit({
    keyGenerator: keyPorIp,
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Demasiados intentos de inscripción. Intenta de nuevo en un rato.'
});

// Rutas base: /tarjeta  (las de /unirse van primero)
router.get('/unirse/:token', limitador, TarjetaPublicaController.formulario);
router.post('/unirse/:token', limitadorAlta, TarjetaPublicaController.inscribir);
router.get('/:token', limitador, TarjetaPublicaController.show);
router.get('/:token/wallet', limitador, TarjetaPublicaController.wallet);

module.exports = router;
