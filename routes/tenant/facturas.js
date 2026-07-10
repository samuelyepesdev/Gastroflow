const express = require('express');
const router = express.Router();
const FacturasController = require('../../app/Http/Controllers/Tenant/FacturasController');

// GET /facturas/facturar - Pantalla POS
router.get('/facturar', FacturasController.facturar);

// POST /facturas - Crear factura
router.post('/', FacturasController.store);

// GET /facturas/:id/imprimir - Vista de impresión
router.get('/:id/imprimir', FacturasController.imprimir);

// GET /facturas/:id/detalles - API: Detalles de factura
router.get('/:id/detalles', FacturasController.getDetalles);

// POST /facturas/:id/facturacion-electronica/reintentar - Reintentar emisión electrónica fallida
router.post('/:id/facturacion-electronica/reintentar', FacturasController.reintentarFacturacionElectronica);

module.exports = router;
