const express = require('express');
const rateLimit = require('express-rate-limit');
const hubToken = require('../middleware/hubToken');
const HubResumenService = require('../services/Admin/HubResumenService');

const router = express.Router();

// Safe Hub consulta cada ~5 minutos; este tope solo frena abusos si el token se filtra.
const hubLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas consultas.' }
});

// Rutas base: /api/hub
router.get('/resumen', hubLimiter, hubToken, async (req, res) => {
    try {
        res.set('Cache-Control', 'no-store');
        res.json(await HubResumenService.obtener());
    } catch (error) {
        console.error('[hub] No se pudo armar el resumen:', error.message);
        res.status(503).json({ error: 'No se pudo consultar la base de datos' });
    }
});

module.exports = router;
