const PagarItemIndividualService = require('./PagarItemIndividualService');

class PagarMultiplesItemsService {
    /**
     * @description Procesa el pago de múltiples ítems del pedido a la vez.
     * @param {Object} param0
     * @param {string} param0.tenantId
     * @param {Array<{itemId: number|string, cantidad: number}>} param0.items - Lista de ítems con su ID y cantidad a pagar.
     * @param {string} param0.forma_pago - Forma de pago ('efectivo' o 'transferencia').
     */
    static async execute({ tenantId, items, forma_pago }) {
        if (!forma_pago || !['efectivo', 'transferencia'].includes(forma_pago)) {
            throw new Error('Forma de pago requerida y debe ser efectivo o transferencia');
        }

        if (!Array.isArray(items) || items.length === 0) {
            throw new Error('Debe seleccionar al menos un ítem para realizar el pago');
        }

        const resultados = [];

        for (const item of items) {
            const { itemId, cantidad } = item;
            if (!itemId) {
                continue;
            }

            const result = await PagarItemIndividualService.execute({
                tenantId,
                itemId,
                forma_pago,
                cantidad: Number(cantidad),
                skipEvent: true
            });
            resultados.push({ itemId, result });
        }

        // Emitir un solo evento SSE para todos los ítems procesados
        if (items.length > 0 && items[0].itemId) {
            try {
                const db = require('../../../config/database');
                const [rows] = await db.query(
                    'SELECT pi.pedido_id, p.mesa_id FROM pedido_items pi INNER JOIN pedidos p ON pi.pedido_id = p.id WHERE pi.id = ? AND p.tenant_id = ?',
                    [items[0].itemId, tenantId]
                );
                if (rows.length > 0) {
                    const { pedido_id, mesa_id } = rows[0];
                    const WhatsAppService = require('../WhatsAppService');
                    WhatsAppService.events.emit('orderCreated', {
                        tenantId,
                        pedidoId: pedido_id,
                        mesaId: mesa_id,
                        action: 'items_updated'
                    });
                }
            } catch (err) {
                // eslint-disable-next-line no-console
                console.error('Error al emitir evento SSE en PagarMultiplesItemsService:', err);
            }
        }

        return {
            success: true,
            message: `${resultados.length} ítems procesados correctamente`,
            detalles: resultados
        };
    }
}

module.exports = PagarMultiplesItemsService;
