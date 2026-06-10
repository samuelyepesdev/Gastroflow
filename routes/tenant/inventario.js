const express = require('express');
const router = express.Router();
const InventarioController = require('../../app/Http/Controllers/Tenant/InventarioController');
const { requirePermission } = require('../../middleware/auth');
const BaseRequest = require('../../app/Http/Requests/BaseRequest');
const StoreInsumoRequest = require('../../app/Http/Requests/Tenant/StoreInsumoRequest');

// GET /inventario - Vista principal
router.get('/', InventarioController.index);

// API Insumos
router.get('/api/insumos', InventarioController.listInsumos);
router.get('/api/insumos/:id', InventarioController.getInsumo);
router.post(
    '/api/insumos',
    requirePermission('inventario.editar'),
    BaseRequest.validate(StoreInsumoRequest),
    InventarioController.storeInsumo
);
router.put(
    '/api/insumos/:id',
    requirePermission('inventario.editar'),
    BaseRequest.validate(StoreInsumoRequest),
    InventarioController.updateInsumo
);
router.delete('/api/insumos/:id', requirePermission('inventario.editar'), InventarioController.deleteInsumo);

// API Stats & Helpers
router.get('/api/resumen', InventarioController.getResumen);
router.get('/api/lista-mercado', InventarioController.getListaMercado);
router.get('/api/check-producto/:productoId', InventarioController.checkStockProducto);

// API Movimientos
router.get('/api/movimientos', InventarioController.getMovimientos);
router.post('/api/movimientos/entrada', requirePermission('inventario.editar'), InventarioController.registrarEntrada);
router.post('/api/movimientos/salida', requirePermission('inventario.editar'), InventarioController.registrarSalida);
router.post('/api/movimientos/ajuste', requirePermission('inventario.editar'), InventarioController.registrarAjuste);

module.exports = router;
