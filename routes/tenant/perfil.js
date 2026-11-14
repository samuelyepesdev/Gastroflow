const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const multer = require('multer');
const PerfilController = require('../../app/Http/Controllers/Tenant/PerfilController');
const { requirePermission } = require('../../middleware/auth');

// Genera varios PDFs y envía correo de forma síncrona: tope por usuario (no por IP) para que no se use
// para saturar el servidor ni para spam de correos.
const testReportLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: req => `perfil-test-report:${req.tenant?.id}:${req.user?.id}`,
    message: { success: false, message: 'Demasiados reportes de prueba. Intenta de nuevo en una hora.' }
});

// Configuración de Multer para el logo
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 }, // Máx 2 MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Formato de archivo no permitido. Sube una imagen válida.'));
        }
    }
});

// GET /perfil - Vista perfil
router.get('/', requirePermission('perfil.ver'), PerfilController.index);

// GET /perfil/api/crecimiento - Datos del panel de crecimiento (tab Crecimiento)
router.get('/api/crecimiento', requirePermission('perfil.ver'), PerfilController.crecimiento);

// POST /perfil/actualizar - Actualizar datos y logo
router.post('/actualizar', requirePermission('perfil.editar'), upload.single('logo'), PerfilController.update);

// POST /perfil/test-report - Enviar reporte de prueba
router.post('/test-report', requirePermission('perfil.editar'), testReportLimiter, PerfilController.testReport);

module.exports = router;
