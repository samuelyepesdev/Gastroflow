const express = require('express');
const router = express.Router();
const ReservasController = require('../../app/Http/Controllers/Tenant/ReservasController');
const { requirePermission } = require('../../middleware/auth');

// Rutas base: /reservas (la misma página y su API JSON)
router.get('/', requirePermission('reservas.ver'), ReservasController.index);
router.get('/data', requirePermission('reservas.ver'), ReservasController.listar);
router.get('/mesas', requirePermission('reservas.ver'), ReservasController.mesas);
router.get('/mesas-disponibles', requirePermission('reservas.ver'), ReservasController.mesasDisponibles);
router.get('/disponibilidad', requirePermission('reservas.ver'), ReservasController.disponibilidad);

router.post('/', requirePermission('reservas.gestionar'), ReservasController.store);
router.patch('/:id/estado', requirePermission('reservas.gestionar'), ReservasController.estado);
router.patch('/:id/mesa', requirePermission('reservas.gestionar'), ReservasController.mesa);

router.put('/mesas/capacidades', requirePermission('reservas.configurar'), ReservasController.capacidades);
router.put('/config', requirePermission('reservas.configurar'), ReservasController.guardarConfig);
router.post('/config/enlace', requirePermission('reservas.configurar'), ReservasController.regenerarEnlace);

module.exports = router;
