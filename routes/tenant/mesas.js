const express = require('express');
const router = express.Router();
const { requirePermission } = require('../../middleware/auth');
const { queueForSync } = require('../../middleware/desktopOutbox');
const BaseRequest = require('../../app/Http/Requests/BaseRequest');
const StoreMesaRequest = require('../../app/Http/Requests/Tenant/StoreMesaRequest');

// Importar controladores modularizados
const Dashboard = require('../../app/Http/Controllers/Tenant/Mesas/MesaDashboardController');
const Management = require('../../app/Http/Controllers/Tenant/Mesas/MesaManagementController');
const Actions = require('../../app/Http/Controllers/Tenant/Mesas/MesaActionsController');
const QR = require('../../app/Http/Controllers/Tenant/Mesas/MesaQRController');
const Pedido = require('../../app/Http/Controllers/Tenant/Mesas/PedidoController');
const Items = require('../../app/Http/Controllers/Tenant/Mesas/PedidoItemsController');

// --- DASHBOARD ---
router.get('/', Dashboard.index);
router.get('/listar', Dashboard.list);

// --- GESTIÓN DE MESAS (CRUD) ---
router.post('/crear', requirePermission('mesas.gestionar'), BaseRequest.validate(StoreMesaRequest), Management.store);
router.put('/:mesaId', requirePermission('mesas.editar'), BaseRequest.validate(StoreMesaRequest), Management.update);
router.delete('/:mesaId', requirePermission('mesas.eliminar'), Management.destroy);
router.post('/crear-masivas', Management.storeMasivas);

// --- CÓDIGOS QR ---
router.post('/qrs/generar', requirePermission('mesas.qr'), QR.generar);
router.get('/qrs/imprimir', requirePermission('mesas.qr'), QR.imprimir);

// --- PEDIDOS (Ciclo de Vida) ---
// queueForSync solo encola en sync_outbox cuando este proceso corre en modo
// desktop (SYNC_API_URL seteado); en producción normal es un no-op. Las
// acciones aquí deben coincidir exactamente con el dispatch de
// services/Tenant/SyncService.js del lado servidor.
router.post('/abrir', queueForSync('mesas.abrir_pedido'), Pedido.abrir);
router.get('/pedidos/:pedidoId', Pedido.show);
router.patch('/pedidos/:pedidoId/propina', queueForSync('pedidos.actualizar_propina'), Pedido.updatePropina);
router.put('/pedidos/:pedidoId/cliente', Pedido.updateCliente);
router.delete('/pedidos/:pedidoId/limpiar', Pedido.limpiar);
router.post('/pedidos/:pedidoId/facturar', Pedido.facturar);

// --- ITEMS DEL PEDIDO ---
router.post('/pedidos/:pedidoId/items', queueForSync('pedido_items.agregar'), Items.store);
router.post('/pedidos/:pedidoId/servicios', queueForSync('pedido_items.agregar_servicio'), Items.addService);
router.put('/items/:itemId/cantidad', queueForSync('pedido_items.actualizar_cantidad'), Items.updateCantidad);
router.patch('/items/:itemId/cantidad', queueForSync('pedido_items.actualizar_cantidad'), Items.updateCantidad);
router.delete('/items/:itemId', queueForSync('pedido_items.eliminar'), Items.destroy);
router.put('/items/:itemId/enviar', Items.enviar);
router.put('/items/:itemId/estado', Items.updateEstado);
router.put('/items/:itemId/pagar', Items.pagar);
router.post('/items/pagar-multiples', Items.pagarMultiples);

// --- ACCIONES OPERATIVAS ---
router.put('/pedidos/:pedidoId/mover', Actions.moverPedido);
router.post('/pedidos/:pedidoId/mover-items', Actions.moverItems);
router.put('/:mesaId/liberar', Actions.liberar);

module.exports = router;
