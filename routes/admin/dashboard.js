const express = require('express');
const router = express.Router();
const DashboardController = require('../../app/Http/Controllers/Admin/DashboardController');

// Guard de superadmin aplicado en routes/web.js (requireRole(ROLES.SUPERADMIN))

// GET / - Vista principal
router.get('/', DashboardController.index);

// API Stats en vivo
router.get('/live-stats', DashboardController.getLiveStats);

// SSE: aviso de venta nueva en cualquier tenant (refresca live-stats)
router.get('/live-stream', DashboardController.liveStream);

module.exports = router;
