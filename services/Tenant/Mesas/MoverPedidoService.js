const db = require('../../../config/database');
const RealtimeEvents = require('../../Shared/RealtimeEvents');

class MoverPedidoService {
    /**
     * @description Mueve un pedido completo de una mesa a otra
     */
    static async execute({ tenantId, pedidoId, mesa_destino_id }) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const [pedidos] = await connection.query(
                'SELECT * FROM pedidos WHERE id = ? AND tenant_id = ? FOR UPDATE',
                [pedidoId, tenantId]
            );
            if (pedidos.length === 0) {
                throw new Error('Pedido no encontrado');
            }
            const pedido = pedidos[0];

            const [mesaDest] = await connection.query('SELECT id FROM mesas WHERE id = ? AND tenant_id = ?', [
                mesa_destino_id,
                tenantId
            ]);
            if (mesaDest.length === 0) {
                throw new Error('Mesa destino no encontrada');
            }

            const [abiertosDestino] = await connection.query(
                `SELECT COUNT(*) as cnt FROM pedidos WHERE mesa_id = ? AND estado NOT IN ('cerrado','cancelado')`,
                [mesa_destino_id]
            );
            if ((abiertosDestino[0]?.cnt || 0) > 0) {
                throw new Error('La mesa destino tiene un pedido activo');
            }

            await connection.query('UPDATE pedidos SET mesa_id = ? WHERE id = ?', [mesa_destino_id, pedidoId]);

            const [restantesOrigen] = await connection.query(
                `SELECT COUNT(*) as cnt FROM pedidos WHERE mesa_id = ? AND estado NOT IN ('cerrado','cancelado')`,
                [pedido.mesa_id]
            );
            if ((restantesOrigen[0]?.cnt || 0) === 0) {
                await connection.query('UPDATE mesas SET estado = "libre" WHERE id = ?', [pedido.mesa_id]);
            }

            await connection.query('UPDATE mesas SET estado = "ocupada" WHERE id = ?', [mesa_destino_id]);

            await connection.commit();
            RealtimeEvents.emitMesasChanged(tenantId);

            return { message: 'Pedido movido', mesa_origen_id: pedido.mesa_id, mesa_destino_id };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }
}

module.exports = MoverPedidoService;
