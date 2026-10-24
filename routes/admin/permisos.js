const express = require('express');
const router = express.Router();
const PermisosController = require('../../app/Http/Controllers/Admin/PermisosController');
const PermisosMasivosController = require('../../app/Http/Controllers/Admin/PermisosMasivosController');

// Guard de superadmin aplicado en routes/web.js (requireRole(ROLES.SUPERADMIN))

// GET / - Vista principal
router.get('/', PermisosController.index);

// API Usuarios por tenant
router.get('/usuarios', PermisosController.listUsuarios);

// API Permisos por usuario
router.get('/usuario/:userId', PermisosController.getUsuarioPermisos);
router.put('/usuario/:userId', PermisosController.updateUsuarioPermisos);

// Gestión masiva: edición por alcance, reporte de excepciones, matriz de roles y auditoría
router.get('/masivo', PermisosMasivosController.index);
router.post('/masivo/previsualizar', PermisosMasivosController.previsualizar);
router.post('/masivo/aplicar', PermisosMasivosController.aplicar);
router.get('/masivo/excepciones', PermisosMasivosController.excepciones);
router.post('/masivo/excepciones/reiniciar', PermisosMasivosController.reiniciar);
router.put('/masivo/roles/:rolId', PermisosMasivosController.guardarRol);
router.get('/masivo/auditoria', PermisosMasivosController.auditoria);

module.exports = router;
