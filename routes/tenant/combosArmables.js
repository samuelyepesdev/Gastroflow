const express = require('express');
const router = express.Router();
const CombosArmablesController = require('../../app/Http/Controllers/Tenant/CombosArmablesController');
const { requirePermission } = require('../../middleware/auth');

// Mismos permisos que /combos (combos.ver / combos.gestionar).
router.get('/', requirePermission('combos.ver'), CombosArmablesController.index);
router.post('/', requirePermission('combos.gestionar'), CombosArmablesController.store);
router.get('/:id', requirePermission('combos.ver'), CombosArmablesController.show);
router.put('/:id', requirePermission('combos.gestionar'), CombosArmablesController.update);
router.delete('/:id', requirePermission('combos.gestionar'), CombosArmablesController.destroy);

module.exports = router;
