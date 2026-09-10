const RealtimeEvents = require('../../../../services/Shared/RealtimeEvents');

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

        // Callback para solicitudes del cliente desde el menú QR (llamar mesero / pedir cuenta)
        const onMesaSolicitud = data => {
            if (String(data.tenantId) === String(tenantId)) {
                res.write(`data: ${JSON.stringify({ event: 'mesaSolicitud', ...data })}\n\n`);
                if (typeof res.flush === 'function') {
                    res.flush();
                }
            }
        };

        // Suscribirse a los eventos en el servicio
        RealtimeEvents.on('orderCreated', onOrderCreated);
        RealtimeEvents.on('mesaSolicitud', onMesaSolicitud);

        // Mantener la conexión enviando keep-alive cada 30 segundos
        const keepAlive = setInterval(() => {
            res.write(': keepalive\n\n');
            if (typeof res.flush === 'function') {
                res.flush();
            }
        }, 30000);

        // Limpiar al cerrar la conexión. 'close' en req no siempre dispara de forma
        // confiable detrás de proxies/reconexiones del navegador (dejaba listeners
        // huérfanos acumulándose -- ver warning de MaxListeners), así que se engancha
        // también en res.close como respaldo. cleanup() es idempotente: da igual si
        // ambos eventos disparan.
        let cleaned = false;
        const cleanup = () => {
            if (cleaned) {
                return;
            }
            cleaned = true;
            // console.log(`[SSE] Cliente desconectado para Tenant ${tenantId}`);
            RealtimeEvents.removeListener('orderCreated', onOrderCreated);
            RealtimeEvents.removeListener('mesaSolicitud', onMesaSolicitud);
            clearInterval(keepAlive);
        };
        req.on('close', cleanup);
        res.on('close', cleanup);

        // Enviar un mensaje inicial para confirmar conexión
        res.write(`data: ${JSON.stringify({ event: 'connected', tenantId })}\n\n`);
        if (typeof res.flush === 'function') {
            res.flush();
        }
    }
}

module.exports = new NotificationController();
