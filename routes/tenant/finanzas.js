const express = require('express');
const router = express.Router();
const FinanzasController = require('../../app/Http/Controllers/Tenant/FinanzasController');
const { requirePermission } = require('../../middleware/auth');

// GET /finanzas - Vista principal
router.get('/', requirePermission('finanzas.ver'), FinanzasController.index);

// API para gráficos
router.get('/api/chart-data', requirePermission('finanzas.ver'), FinanzasController.getChartData);

module.exports = router;
