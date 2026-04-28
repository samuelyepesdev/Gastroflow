const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const PedidoQRController = require('../app/Http/Controllers/Public/PedidoQRController');

// Rate limiter para evitar SPAM: Máximo 3 pedidos cada 10 minutos por IP
const qrOrderLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutos
    max: 3, // Límite de 3 peticiones por IP
    message: { error: 'Demasiados pedidos en poco tiempo. Por favor, espera unos minutos o llama al mesero directamente.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Endpoint para recibir un pedido
// URL final: POST /api/qr/pedidos
router.post('/pedidos', qrOrderLimiter, PedidoQRController.crearPedido);

module.exports = router;
