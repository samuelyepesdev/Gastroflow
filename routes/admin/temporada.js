const express = require('express');
const router = express.Router();
const TemporadaAdminController = require('../../app/Http/Controllers/Admin/TemporadaAdminController');

// Guard de superadmin aplicado en routes/web.js (requireSuperadmin)

router.get('/', TemporadaAdminController.index);
router.put('/global', TemporadaAdminController.guardarGlobal);
router.put('/restaurantes/:id', TemporadaAdminController.setEstado);

module.exports = router;
