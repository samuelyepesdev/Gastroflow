const PedidoQRService = require('../../../../services/Public/PedidoQRService');

class PedidoQRController {
    static async crearPedido(req, res) {
        try {
            const { qr_token, items, notas } = req.body;

            // Extraer la IP del cliente de forma segura (manejando proxies si los hay)
            const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

            const resultado = await PedidoQRService.procesarPedido(qr_token, items, notas, clientIp, req.cookies);

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

    // GET /api/qr/pedidos/estado?qr_token=...
    static async estadoMesa(req, res) {
        try {
            const data = await PedidoQRService.getEstadoMesa(req.query.qr_token, req.cookies);
            return res.status(200).json({ success: true, data });
        } catch (error) {
            const status = error.status || 500;
            return res.status(status).json({
                success: false,
                error: error.status ? error.message : 'Error consultando el estado de la mesa.'
            });
        }
    }

    // POST /api/qr/mesa/solicitud  { qr_token, tipo: 'mesero' | 'cuenta' }
    static async solicitud(req, res) {
        try {
            const { qr_token, tipo } = req.body;
            await PedidoQRService.registrarSolicitud(qr_token, tipo, req.cookies);
            return res.status(200).json({ success: true, message: 'Solicitud enviada al personal.' });
        } catch (error) {
            console.error('Error en solicitud QR:', error);
            const status = error.status || 500;
            return res.status(status).json({
                success: false,
                error: error.status ? error.message : 'No se pudo enviar la solicitud.'
            });
        }
    }
}

module.exports = PedidoQRController;
