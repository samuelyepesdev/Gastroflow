const express = require('express');
const router = express.Router();
const MesasController = require('../../app/Http/Controllers/Tenant/MesasController');
const { requirePermission } = require('../../middleware/auth');
const BaseRequest = require('../../app/Http/Requests/BaseRequest');
const StoreMesaRequest = require('../../app/Http/Requests/Tenant/StoreMesaRequest');

// GET /mesas - Vista principal
router.get('/', MesasController.index);

// GET /mesas/listar - Listado API
router.get('/listar', MesasController.list);

// POST /mesas/qrs/generar - Generar tokens QR para mesas sin token
router.post('/qrs/generar', requirePermission('mesas.qr'), MesasController.generarTokensQR);

// GET /mesas/qrs/imprimir - Vista para imprimir QRs
router.get('/qrs/imprimir', requirePermission('mesas.qr'), MesasController.imprimirQRs);

// POST /mesas/crear - Crear mesa
router.post('/crear', requirePermission('mesas.gestionar'), BaseRequest.validate(StoreMesaRequest), MesasController.store);

// PUT /mesas/:mesaId - Editar mesa
router.put('/:mesaId', requirePermission('mesas.editar'), BaseRequest.validate(StoreMesaRequest), MesasController.update);

// POST /mesas/crear-masivas - Crear múltiples
router.post('/crear-masivas', MesasController.storeMasivas);

// POST /mesas/abrir - Abrir pedido
router.post('/abrir', MesasController.abrirPedido);

// GET /mesas/pedidos/:pedidoId - Ver pedido
router.get('/pedidos/:pedidoId', MesasController.getPedido);

// PATCH /mesas/pedidos/:pedidoId/propina - Propina
router.patch('/pedidos/:pedidoId/propina', MesasController.updatePropina);

// PUT/PATCH /mesas/items/:itemId/cantidad - Cantidad item
router.put('/items/:itemId/cantidad', MesasController.updateItemCantidad);
router.patch('/items/:itemId/cantidad', MesasController.updateItemCantidad);

// POST /mesas/pedidos/:pedidoId/items - Agregar item
router.post('/pedidos/:pedidoId/items', MesasController.addItem);

// DELETE /mesas/pedidos/:pedidoId/limpiar - Vaciar pedido
router.delete('/pedidos/:pedidoId/limpiar', MesasController.limpiarPedido);

// POST /mesas/pedidos/:pedidoId/servicios - Agregar servicio
router.post('/pedidos/:pedidoId/servicios', MesasController.addService);

// DELETE /mesas/items/:itemId - Eliminar item
router.delete('/items/:itemId', MesasController.destroyItem);

// PUT /mesas/items/:itemId/pagar - Pagar item individual
router.put('/items/:itemId/pagar', MesasController.pagarItem);

// PUT /mesas/items/:itemId/enviar - Enviar a cocina
router.put('/items/:itemId/enviar', MesasController.enviarItem);

// PUT /mesas/items/:itemId/estado - Estado item (cocina)
router.put('/items/:itemId/estado', MesasController.updateItemEstado);

// POST /mesas/pedidos/:pedidoId/facturar - Cerrar y facturar
router.post('/pedidos/:pedidoId/facturar', MesasController.facturarPedido);

// PUT /mesas/pedidos/:pedidoId/mover - Mover todo el pedido
router.put('/pedidos/:pedidoId/mover', MesasController.moverPedido);

// POST /mesas/pedidos/:pedidoId/mover-items - Mover items específicos
router.post('/pedidos/:pedidoId/mover-items', MesasController.moverItems);

// PUT /mesas/:mesaId/liberar - Liberar mesa
router.put('/:mesaId/liberar', MesasController.liberarMesa);

// PUT /mesas/pedidos/:pedidoId/cliente - Cliente del pedido
router.put('/pedidos/:pedidoId/cliente', MesasController.updatePedidoCliente);

// DELETE /mesas/:mesaId - Eliminar mesa definitiva
router.delete('/:mesaId', requirePermission('mesas.eliminar'), MesasController.destroy);

module.exports = router;
