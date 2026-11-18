const express = require('express');
const rateLimit = require('express-rate-limit');
const { keyPorIp } = require('../utils/rateLimitKey');
const ReservaPublicaController = require('../app/Http/Controllers/Public/ReservaPublicaController');

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

// Crear una reserva es más estricto: cada intento escribe en la base de datos.
const limitadorAlta = rateLimit({
    keyGenerator: keyPorIp,
    windowMs: 60 * 60 * 1000,
    max: 8,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiados intentos de reserva. Intenta de nuevo en un rato.' }
});

// Rutas base: /reservar
router.get('/:token', limitador, ReservaPublicaController.pagina);
router.get('/:token/disponibilidad', limitador, ReservaPublicaController.disponibilidad);
router.post('/:token', limitadorAlta, ReservaPublicaController.crear);

module.exports = router;
