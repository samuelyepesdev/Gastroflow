const express = require('express');
const router = express.Router();
const AsistenteAdminController = require('../../app/Http/Controllers/Admin/AsistenteController');
const AsistenteSistemaController = require('../../app/Http/Controllers/Admin/AsistenteSistemaController');
const { requireProveedorIA } = require('../../middleware/asistente');
const { crearLimitesAsistente } = require('../../middleware/asistenteLimites');

const limites = crearLimitesAsistente();
// Audio crudo (no multipart), tope de 1 MB. El tipo lo valida el servicio de transcripción.
const audioCrudo = express.raw({ type: () => true, limit: '1mb' });

// Guard de superadmin aplicado en routes/web.js (requireSuperadmin)

router.get('/', AsistenteAdminController.index);
router.get('/api/resumen', AsistenteAdminController.resumen);
router.get('/api/tenants/:tenantId/usuarios', AsistenteAdminController.usuarios);
router.put('/api/tenants/:tenantId/addon', AsistenteAdminController.addon);
router.put('/api/tenants/:tenantId/nombre', AsistenteAdminController.nombre);
router.put('/api/tenants/:tenantId/usuarios/:userId/acceso', AsistenteAdminController.acceso);

// Asistente del sistema (consulta de la plataforma): solo superadmin, solo lectura.
router.get('/api/chat/estado', AsistenteSistemaController.estado);
router.post('/api/chat/comando', requireProveedorIA, limites.sistema, AsistenteSistemaController.comando);
router.post(
    '/api/chat/transcribir',
    requireProveedorIA,
    limites.sistemaVoz,
    audioCrudo,
    AsistenteSistemaController.transcribir
);

module.exports = router;
