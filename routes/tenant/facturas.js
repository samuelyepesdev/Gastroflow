const express = require('express');
const router = express.Router();
const FacturasController = require('../../app/Http/Controllers/Tenant/FacturasController');
const { requirePermission } = require('../../middleware/auth');

// Crear facturas: facturas.crear, o ventas_evento.realizar (facturación de eventos, que se asigna por
// usuario y no implica facturas.crear). Es el mismo control que ya tienen las otras vías de facturar
// (mesas.facturar en Mesas, pos.vender en el POS).
const puedeCrear = requirePermission('facturas.crear', 'ventas_evento.realizar');

// Ver/imprimir: además de facturas.ver, quien factura necesita imprimir su comprobante
// (pos_pago.js y pos_qz.js llaman a /facturas/:id/imprimir[-json] desde el POS y Mesas).
const puedeVer = requirePermission(
    'facturas.ver',
    'facturas.crear',
    'pos.vender',
    'mesas.facturar',
    'ventas_evento.realizar'
);

// GET /facturas/facturar - Pantalla POS
router.get('/facturar', puedeCrear, FacturasController.facturar);

// POST /facturas - Crear factura
router.post('/', puedeCrear, FacturasController.store);

// GET /facturas/:id/imprimir - Vista de impresión
router.get('/:id/imprimir', puedeVer, FacturasController.imprimir);

// GET /facturas/:id/imprimir-json - Datos JSON para impresión ESC/POS (QZ Tray)
router.get('/:id/imprimir-json', puedeVer, FacturasController.imprimirJson);

// GET /facturas/:id/detalles - API: Detalles de factura
router.get('/:id/detalles', puedeVer, FacturasController.getDetalles);

// PUT /facturas/:id/cliente - Corregir el cliente de una factura normal (no electrónica)
router.put('/:id/cliente', requirePermission('facturas.editar'), FacturasController.editarCliente);

// POST /facturas/:id/facturacion-electronica/reintentar - Reintentar emisión electrónica fallida
router.post('/:id/facturacion-electronica/reintentar', puedeCrear, FacturasController.reintentarFacturacionElectronica);

module.exports = router;
