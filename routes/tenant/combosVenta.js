const express = require('express');
const router = express.Router();
const CombosArmablesController = require('../../app/Http/Controllers/Tenant/CombosArmablesController');

// Solo lectura del catálogo vendible. Sin permiso de gestión: lo usan meseros y cajeros
// desde Mesas y POS, igual que la búsqueda de productos.
router.get('/', CombosArmablesController.venta);

module.exports = router;
