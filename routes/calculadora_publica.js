const express = require('express');
const rateLimit = require('express-rate-limit');
const { keyPorIp } = require('../utils/rateLimitKey');
const CalculadoraController = require('../app/Http/Controllers/Public/CalculadoraController');

const router = express.Router();

const limitador = rateLimit({
    keyGenerator: keyPorIp,
    windowMs: 10 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false
});

// Cada cálculo escribe un prospecto en la base de datos: límite más estricto.
const limitadorCalculo = rateLimit({
    keyGenerator: keyPorIp,
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Hiciste varios cálculos seguidos. Intenta de nuevo en un rato.' }
});

// Rutas base: /calculadora
router.get('/', limitador, CalculadoraController.pagina);
router.post('/calcular', limitadorCalculo, CalculadoraController.calcular);

module.exports = router;
