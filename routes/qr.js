const express = require('express');
const router = express.Router();
const MenuQRController = require('../app/Http/Controllers/Public/MenuQRController');

// Rutas base: /qr

// GET /qr/:tenantSlug/:qrToken -> Muestra la vista del menú (catálogo)
router.get('/:tenantSlug/:qrToken', MenuQRController.showMenu);

module.exports = router;
