const express = require('express');
const router = express.Router();
const multer = require('multer');
const FidelizacionController = require('../../app/Http/Controllers/Tenant/FidelizacionController');
const { requirePermission } = require('../../middleware/auth');

const subirImagen = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 3 * 1024 * 1024 },
    fileFilter: (req, file, cb) => cb(null, /^image\/(png|jpe?g|webp|gif)$/i.test(file.mimetype))
}).single('logo');

// Errores de la subida (tamaño, tipo) en JSON, como el resto de esta API
const logoUpload = (req, res, next) =>
    subirImagen(req, res, err => {
        if (err) {
            return res.status(400).json({
                error:
                    err.code === 'LIMIT_FILE_SIZE' ? 'El logo supera el máximo de 3 MB' : 'No se pudo leer el archivo'
            });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'Selecciona una imagen PNG, JPG, WEBP o GIF' });
        }
        next();
    });

// Rutas base: /api/fidelizacion
router.get('/programa', requirePermission('fidelizacion.ver'), FidelizacionController.programa);
router.put('/programa', requirePermission('fidelizacion.gestionar'), FidelizacionController.guardarPrograma);
router.get('/productos', requirePermission('fidelizacion.ver'), FidelizacionController.productos);

router.get('/inscripcion', requirePermission('fidelizacion.gestionar'), FidelizacionController.inscripcion);
router.post(
    '/inscripcion/regenerar',
    requirePermission('fidelizacion.gestionar'),
    FidelizacionController.regenerarInscripcion
);

router.get(
    '/inscripcion/tarjeta.pdf',
    requirePermission('fidelizacion.gestionar'),
    FidelizacionController.tarjetaQrPdf
);

router.post('/logo', requirePermission('fidelizacion.gestionar'), logoUpload, FidelizacionController.subirLogo);
router.get('/disenos', requirePermission('fidelizacion.ver'), FidelizacionController.disenos);
router.get('/diseno/vista-previa', requirePermission('fidelizacion.ver'), FidelizacionController.vistaPreviaDiseno);

router.get('/tarjetas', requirePermission('fidelizacion.ver'), FidelizacionController.listar);
router.post('/tarjetas', requirePermission('fidelizacion.gestionar'), FidelizacionController.inscribir);
// Antes de /:id para que "cliente" no se tome como id
router.get('/tarjetas/cliente/:clienteId', requirePermission('fidelizacion.ver'), FidelizacionController.porCliente);
router.get('/tarjetas/:id', requirePermission('fidelizacion.ver'), FidelizacionController.detalle);
router.post('/tarjetas/:id/canjear', requirePermission('fidelizacion.gestionar'), FidelizacionController.canjear);
router.get('/tarjetas/:id/wallet', requirePermission('fidelizacion.ver'), FidelizacionController.wallet);

module.exports = router;
