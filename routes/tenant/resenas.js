const express = require('express');
const router = express.Router();
const ResenasController = require('../../app/Http/Controllers/Tenant/ResenasController');
const { requirePermission } = require('../../middleware/auth');

// Rutas base: /resenas (la misma página y su API JSON)
router.get('/', requirePermission('resenas.ver'), ResenasController.index);
router.get('/data', requirePermission('resenas.ver'), ResenasController.listar);

router.patch('/:id(\\d+)/estado', requirePermission('resenas.gestionar'), ResenasController.estado);

router.put('/config', requirePermission('resenas.configurar'), ResenasController.guardarConfig);
router.post('/config/enlace', requirePermission('resenas.configurar'), ResenasController.regenerarEnlace);

module.exports = router;
