const WhatsAppService = require('../../../../services/Tenant/WhatsAppService');

class NotificationController {
    /**
     * Suscribe al cliente a eventos en tiempo real usando Server-Sent Events (SSE)
     */
    async subscribe(req, res) {
        const tenantId = req.tenant?.id;

        if (!tenantId) {
            return res.status(400).json({ error: 'Tenant ID es requerido' });
        }

        // Configurar headers para SSE
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        // console.log(`[SSE] Cliente suscrito para Tenant ${tenantId}`);

        // Callback para cuando se crea un pedido
        const onOrderCreated = data => {
            // Solo enviar si el pedido pertenece al tenant del cliente suscrito
            if (String(data.tenantId) === String(tenantId)) {
                // eslint-disable-next-line no-console
                console.log(`[SSE] Notificando pedido ${data.pedidoId} a Tenant ${tenantId}`);
                res.write(`data: ${JSON.stringify({ event: 'orderCreated', ...data })}\n\n`);
                if (typeof res.flush === 'function') {
                    res.flush();
                }
            }
        };

        // Suscribirse al evento en el servicio
        WhatsAppService.events.on('orderCreated', onOrderCreated);

        // Limpiar al cerrar la conexión
        req.on('close', () => {
            // console.log(`[SSE] Cliente desconectado para Tenant ${tenantId}`);
            WhatsAppService.events.removeListener('orderCreated', onOrderCreated);
        });

        // Enviar un mensaje inicial para confirmar conexión
        res.write(`data: ${JSON.stringify({ event: 'connected', tenantId })}\n\n`);
        if (typeof res.flush === 'function') {
            res.flush();
        }

        // Mantener la conexión enviando keep-alive cada 30 segundos
        const keepAlive = setInterval(() => {
            res.write(': keepalive\n\n');
            if (typeof res.flush === 'function') {
                res.flush();
            }
        }, 30000);

        req.on('close', () => {
            clearInterval(keepAlive);
        });
    }
}

module.exports = new NotificationController();
