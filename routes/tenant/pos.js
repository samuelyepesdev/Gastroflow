const express = require('express');
const router = express.Router();
const POSController = require('../../app/Http/Controllers/Tenant/POSController');
const { requirePermission } = require('../../middleware/auth');

// Terminal POS
router.get('/', POSController.index);

// API: Productos para la grilla
router.get('/productos', POSController.getProductos);

// API: Estadísticas del día
router.get('/stats', POSController.getStats);

// API: Órdenes guardadas (borradores)
router.get('/borradores', POSController.getBorradores);
router.post('/borradores', requirePermission('pos.vender'), POSController.saveBorrador);
router.delete('/borradores/:id', POSController.deleteBorrador);

// API: Venta POS (accesible con pos.vender, sin necesitar facturas.ver)
router.get('/consumidor-final', POSController.getConsumidorFinal);
router.post('/vender', requirePermission('pos.vender'), POSController.vender);

module.exports = router;
