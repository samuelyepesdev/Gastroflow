const PedidoQRService = require('../../../../services/Public/PedidoQRService');

class PedidoQRController {
    static async crearPedido(req, res) {
        try {
            const { qr_token, items, notas } = req.body;

            // Extraer la IP del cliente de forma segura (manejando proxies si los hay)
            const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

            const resultado = await PedidoQRService.procesarPedido(qr_token, items, notas, clientIp);

            return res.status(200).json({
                success: true,
                message: 'Pedido procesado correctamente.',
                data: resultado
            });

        } catch (error) {
            console.error('Error procesando Pedido QR:', error);

            const status = error.status || 500;
            const message = error.status ? error.message : 'Error interno procesando el pedido.';

            return res.status(status).json({
                success: false,
                error: message
            });
        }
    }
}

module.exports = PedidoQRController;
