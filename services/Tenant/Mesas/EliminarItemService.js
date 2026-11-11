const db = require('../../../config/database');
const SincronizarPrecioPromoService = require('./SincronizarPrecioPromoService');
const RealtimeEvents = require('../../Shared/RealtimeEvents');

class EliminarItemService {
    static async execute({ tenantId, itemId, soloPendiente = false }) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const [rows] = await connection.query(
                'SELECT pi.id, pi.estado, pi.producto_id, p.id as pedido_id, p.mesa_id FROM pedido_items pi INNER JOIN pedidos p ON pi.pedido_id = p.id WHERE pi.id = ? AND p.tenant_id = ? FOR UPDATE',
                [itemId, tenantId]
            );

            if (rows.length === 0) {
                throw new Error('Item no encontrado');
            }

            // Con el item bloqueado: el estado que se revisa es el mismo que se borra (sin carrera con cocina).
            if (soloPendiente && rows[0].estado !== 'pendiente') {
                throw new Error('Ese producto ya no está pendiente');
            }

            const { producto_id: productoId, pedido_id, mesa_id } = rows[0];
            await connection.query('DELETE FROM pedido_items WHERE id = ?', [itemId]);

            const [restantes] = await connection.query('SELECT COUNT(*) as cnt FROM pedido_items WHERE pedido_id = ?', [
                pedido_id
            ]);

            if (restantes[0].cnt === 0) {
                await connection.query("UPDATE pedidos SET estado = 'cancelado' WHERE id = ?", [pedido_id]);
                const [abiertos] = await connection.query(
                    "SELECT COUNT(*) as cnt FROM pedidos WHERE mesa_id = ? AND estado NOT IN ('cerrado','cancelado')",
                    [mesa_id]
                );
                if (abiertos[0].cnt === 0) {
                    await connection.query("UPDATE mesas SET estado = 'libre' WHERE id = ?", [mesa_id]);
                }
            }

            await connection.commit();

            // Fuera de la transacción (ya committeado): si quedan otras filas del
            // mismo producto, una promo "por cantidad" puede desactivarse ahora que
            // bajó el total -- las hermanas deben volver al precio de catálogo.
            try {
                await SincronizarPrecioPromoService.ejecutar(tenantId, pedido_id, productoId);
            } catch (syncErr) {
                // eslint-disable-next-line no-console
                console.error('Error al sincronizar precio de promo tras eliminar item (no bloqueante):', syncErr);
            }

            // Emitir evento SSE
            const action = restantes[0].cnt === 0 ? 'cancelled' : 'items_updated';
            RealtimeEvents.emitPedido({
                tenantId,
                pedidoId: pedido_id,
                mesaId: mesa_id,
                action
            });

            return { message: 'Item eliminado y estado de mesa validado' };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }
}

module.exports = EliminarItemService;
