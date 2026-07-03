const db = require('../../../config/database');

class AgregarServicioService {
    static async execute({ tenantId, pedidoId, servicio_id, cantidad, precio, nota }) {
        if (!servicio_id || !cantidad || !precio) {
            throw new Error('servicio_id, cantidad y precio son requeridos');
        }

        const [pedidoRow] = await db.query('SELECT mesa_id FROM pedidos WHERE id = ? AND tenant_id = ?', [
            pedidoId,
            tenantId
        ]);
        if (pedidoRow.length === 0) {
            throw new Error('Pedido no encontrado');
        }

        const subtotal = Number(cantidad) * Number(precio);
        const mesaId = pedidoRow[0].mesa_id;

        const [result] = await db.query(
            `INSERT INTO pedido_items (tenant_id, pedido_id, servicio_id, es_servicio, cantidad, unidad_medida, precio_unitario, subtotal, estado, nota)
             VALUES (?, ?, ?, 1, ?, 'SERV', ?, ?, 'listo', ?)`,
            [tenantId, pedidoId, servicio_id, cantidad, precio, subtotal, nota || null]
        );

        if (mesaId) {
            await db.query("UPDATE mesas SET estado = 'ocupada' WHERE id = ? AND tenant_id = ?", [mesaId, tenantId]);
        }

        // Emitir evento SSE
        try {
            const WhatsAppService = require('../WhatsAppService');
            WhatsAppService.events.emit('orderCreated', {
                tenantId,
                pedidoId,
                mesaId,
                action: 'items_updated'
            });
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Error al emitir evento SSE en AgregarServicioService:', err);
        }

        return { id: result.insertId };
    }
}

module.exports = AgregarServicioService;
