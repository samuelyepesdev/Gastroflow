const express = require('express');
const router = express.Router();
const EventosController = require('../../app/Http/Controllers/Tenant/EventosController');
const { requirePermission } = require('../../middleware/auth');
const BaseRequest = require('../../app/Http/Requests/BaseRequest');
const StoreEventoRequest = require('../../app/Http/Requests/Tenant/StoreEventoRequest');

// GET /eventos - Listado
router.get('/', requirePermission('eventos.ver'), EventosController.index);

// GET /eventos/activos - Listado activos API
router.get('/activos', requirePermission('eventos.ver', 'ventas_evento.realizar'), EventosController.listActivos);

// POST /eventos - Crear
router.post('/', requirePermission('eventos.crear'), BaseRequest.validate(StoreEventoRequest), EventosController.store);

// PUT /eventos/:id - Editar
router.put(
    '/:id',
    requirePermission('eventos.editar'),
    BaseRequest.validate(StoreEventoRequest),
    EventosController.update
);

// DELETE /eventos/:id - Eliminar
router.delete('/:id', requirePermission('eventos.eliminar'), EventosController.destroy);

module.exports = router;
