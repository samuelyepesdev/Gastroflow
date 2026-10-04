const express = require('express');
const router = express.Router();
const CombosController = require('../../app/Http/Controllers/Tenant/CombosController');
const { requirePermission } = require('../../middleware/auth');

// GET /combos - listado + vista de administración
router.get('/', requirePermission('combos.ver'), CombosController.index);

// POST /combos - crear
router.post('/', requirePermission('combos.gestionar'), CombosController.store);

// GET /combos/:id - detalle (con componentes)
router.get('/:id', requirePermission('combos.ver'), CombosController.show);

// PUT /combos/:id - editar
router.put('/:id', requirePermission('combos.gestionar'), CombosController.update);

// DELETE /combos/:id
router.delete('/:id', requirePermission('combos.gestionar'), CombosController.destroy);

module.exports = router;
