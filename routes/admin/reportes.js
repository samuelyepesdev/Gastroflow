const express = require('express');
const router = express.Router();
const ReportesController = require('../../app/Http/Controllers/Admin/ReportesController');
const authService = require('../../services/Shared/AuthService');
const { ROLES } = require('../../utils/constants');

// Guard: solo superadmin
router.use((req, res, next) => {
    if (!req.user) {
        return res.redirect('/auth/login');
    }
    if (!authService.hasRole(req.user.rol, [ROLES.SUPERADMIN])) {
        return res.redirect('/');
    }
    next();
});

// GET / - Vista principal para exportación de reportes
router.get('/', ReportesController.index);

// GET /exportar-pdf - Generación y descarga del PDF consolidado
router.get('/exportar-pdf', ReportesController.exportPdf);

module.exports = router;
