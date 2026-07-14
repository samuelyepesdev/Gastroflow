const express = require('express');
const router = express.Router();
const JobsController = require('../../app/Http/Controllers/Admin/JobsController');
const authService = require('../../services/Shared/AuthService');
const { ROLES } = require('../../utils/constants');

// Guard: solo superadmin (mismo patrón que routes/admin/reportes.js y routes/admin/planes.js)
router.use((req, res, next) => {
    if (!req.user) {
        return res.redirect('/auth/login');
    }
    if (!authService.hasRole(req.user.rol, [ROLES.SUPERADMIN])) {
        return res.redirect('/');
    }
    next();
});

// GET /admin/jobs/:id - estado del job (polling)
router.get('/:id', JobsController.show);

// GET /admin/jobs/:id/download - descarga el resultado ya generado
router.get('/:id/download', JobsController.download);

module.exports = router;
