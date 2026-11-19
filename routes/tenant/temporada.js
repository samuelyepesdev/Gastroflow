const express = require('express');
const router = express.Router();
const TemporadaController = require('../../app/Http/Controllers/Tenant/TemporadaController');
const { requirePermission } = require('../../middleware/auth');

// Rutas base: /temporada (la página y su API JSON). Todo requiere el mismo permiso.
router.use(requirePermission('temporada.gestionar'));

router.get('/', TemporadaController.index);
router.put('/tema', TemporadaController.guardarTema);
router.post('/promocion', TemporadaController.crearPromocion);
router.get('/vigencias', TemporadaController.vigencias);
router.put('/vigencias', TemporadaController.fijarVigencia);
router.delete('/vigencias/:productoId', TemporadaController.quitarVigencia);

module.exports = router;
