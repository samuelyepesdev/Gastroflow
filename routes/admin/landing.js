const express = require('express');
const router = express.Router();
const LandingController = require('../../app/Http/Controllers/Admin/LandingController');
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

// GET / - Vista del editor
router.get('/', LandingController.index);

// POST / - Actualizar ajustes
router.post('/', LandingController.update);

module.exports = router;
