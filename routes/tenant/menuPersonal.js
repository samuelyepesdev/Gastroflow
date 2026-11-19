const express = require('express');
const router = express.Router();
const MenuPersonalController = require('../../app/Http/Controllers/Tenant/MenuPersonalController');

// Rutas base: /api/menu-personal. Cualquier usuario autenticado de un restaurante gestiona SU propio menú
// (sin permiso específico: solo cambia lo que él mismo ve, nunca lo que puede hacer).
router.get('/', MenuPersonalController.index);
router.put('/', MenuPersonalController.guardar);
router.delete('/', MenuPersonalController.restablecer);

module.exports = router;
