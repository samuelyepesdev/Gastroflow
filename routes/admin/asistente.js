const express = require('express');
const router = express.Router();
const AsistenteAdminController = require('../../app/Http/Controllers/Admin/AsistenteController');

// Guard de superadmin aplicado en routes/web.js (requireSuperadmin)

router.get('/', AsistenteAdminController.index);
router.get('/api/resumen', AsistenteAdminController.resumen);
router.get('/api/tenants/:tenantId/usuarios', AsistenteAdminController.usuarios);
router.put('/api/tenants/:tenantId/addon', AsistenteAdminController.addon);
router.put('/api/tenants/:tenantId/nombre', AsistenteAdminController.nombre);
router.put('/api/tenants/:tenantId/usuarios/:userId/acceso', AsistenteAdminController.acceso);

module.exports = router;
