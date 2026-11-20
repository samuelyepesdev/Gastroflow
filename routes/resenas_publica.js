const express = require('express');
const rateLimit = require('express-rate-limit');
const { keyPorIp } = require('../utils/rateLimitKey');
const ResenaPublicaController = require('../app/Http/Controllers/Public/ResenaPublicaController');

const router = express.Router();

// Sin login: el token es aleatorio (144 bits) y además se limita por IP.
const limitador = rateLimit({
    keyGenerator: keyPorIp,
    windowMs: 10 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas consultas. Espera unos minutos e intenta de nuevo.' }
});

// Enviar una opinión escribe en la base de datos: más estricto. Un comedor entero en la misma red
// puede opinar a la vez, así que el tope por hora no es tan bajo como el de las reservas.
const limitadorAlta = rateLimit({
    keyGenerator: keyPorIp,
    windowMs: 60 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Enviaste varias opiniones seguidas. Intenta de nuevo en un rato.' }
});

// Rutas base: /resena
router.get('/:token', limitador, ResenaPublicaController.pagina);
router.post('/:token', limitadorAlta, ResenaPublicaController.crear);

module.exports = router;
