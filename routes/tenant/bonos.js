const express = require('express');
const router = express.Router();
const BonosController = require('../../app/Http/Controllers/Tenant/BonosController');
const { requirePermission } = require('../../middleware/auth');

// GET /bonos - listado + vista de administración
router.get('/', requirePermission('bonos.ver'), BonosController.index);

// POST /bonos - emitir un bono nuevo
router.post('/', requirePermission('bonos.gestionar'), BonosController.store);

// Diseños del comprobante (antes de /:id para que no los capture como id)
router.get('/plantillas', requirePermission('bonos.gestionar'), BonosController.plantillas);
router.post('/vista-previa', requirePermission('bonos.gestionar'), BonosController.vistaPrevia);

// POST /bonos/:id/comprobante - regenerar el PDF (p. ej. bonos viejos sin logo)
router.post('/:id/comprobante', requirePermission('bonos.gestionar'), BonosController.regenerarComprobante);

// GET /bonos/:id - detalle + movimientos (JSON, para el modal de detalle)
router.get('/:id', requirePermission('bonos.ver'), BonosController.show);

// PUT /bonos/:id/anular
router.put('/:id/anular', requirePermission('bonos.gestionar'), BonosController.anular);

module.exports = router;
