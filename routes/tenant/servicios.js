const express = require('express');
const router = express.Router();
const ServicioController = require('../../app/Http/Controllers/Tenant/ServicioController');
const { requirePermission } = require('../../middleware/auth');
const BaseRequest = require('../../app/Http/Requests/BaseRequest');
const StoreServicioRequest = require('../../app/Http/Requests/Tenant/StoreServicioRequest');

// Web Routes
router.get('/', requirePermission('servicios.ver'), ServicioController.index);
router.post(
    '/',
    requirePermission('servicios.crear'),
    BaseRequest.validate(StoreServicioRequest),
    ServicioController.store
);
router.post(
    '/:id/update',
    requirePermission('servicios.editar'),
    BaseRequest.validate(StoreServicioRequest),
    ServicioController.update
);
router.post('/:id/delete', requirePermission('servicios.eliminar'), ServicioController.destroy);

// API Routes
router.get('/lista', requirePermission('servicios.ver'), ServicioController.listActive);

module.exports = router;
