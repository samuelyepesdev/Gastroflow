const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const PedidoQRController = require('../app/Http/Controllers/Public/PedidoQRController');

// Rate limiter para evitar SPAM: Máximo 3 pedidos cada 10 minutos por IP
const qrOrderLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutos
    max: 3, // Límite de 3 peticiones por IP
    message: {
        error: 'Demasiados pedidos en poco tiempo. Por favor, espera unos minutos o llama al mesero directamente.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Lectura del estado de la mesa: es polling desde el menú, se permite más holgura.
const qrReadLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 240,
    standardHeaders: true,
    legacyHeaders: false
});

// Solicitudes al personal (llamar mesero / pedir cuenta): pocas por IP.
const qrSolicitudLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 10,
    message: { error: 'Ya enviaste varias solicitudes. Espera un momento o acércate al personal.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Endpoint para recibir un pedido
// URL final: POST /api/qr/pedidos
router.post('/pedidos', qrOrderLimiter, PedidoQRController.crearPedido);

// Estado del pedido abierto de la mesa (items + total + estado de cada línea)
router.get('/pedidos/estado', qrReadLimiter, PedidoQRController.estadoMesa);

// Cliente llama al mesero o pide la cuenta
router.post('/mesa/solicitud', qrSolicitudLimiter, PedidoQRController.solicitud);

module.exports = router;
