const db = require('../../../config/database');
const RealtimeEvents = require('../../Shared/RealtimeEvents');

class MoverItemsService {
    /**
     * @description Mueve items específicos de un pedido a otra mesa. (Separador de cuentas)
     */
    static async execute({ tenantId, pedidoOrigenId, itemIds, mesa_destino_id }) {
        if (!Array.isArray(itemIds) || itemIds.length === 0) {
            throw new Error('Seleccione al menos un producto');
        }

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const [pedidos] = await connection.query(
                'SELECT * FROM pedidos WHERE id = ? AND tenant_id = ? FOR UPDATE',
                [pedidoOrigenId, tenantId]
            );
            if (pedidos.length === 0) {
                throw new Error('Pedido origen no encontrado');
            }
            const pedidoOrigen = pedidos[0];

            const [mesaDest] = await connection.query('SELECT id, numero FROM mesas WHERE id = ? AND tenant_id = ?', [
                mesa_destino_id,
                tenantId
            ]);
            if (mesaDest.length === 0) {
                throw new Error('Mesa destino no encontrada');
            }

            const [pedidoDest] = await connection.query(
                `SELECT * FROM pedidos WHERE mesa_id = ? AND estado NOT IN ('cerrado','cancelado') LIMIT 1`,
                [mesa_destino_id]
            );

            let pedidoDestinoId;
            if (pedidoDest.length > 0) {
                pedidoDestinoId = pedidoDest[0].id;
            } else {
                const [insert] = await connection.query(
                    `INSERT INTO pedidos (tenant_id, mesa_id, cliente_id, estado, total) VALUES (?, ?, ?, 'abierto', 0)`,
                    [tenantId, mesa_destino_id, pedidoOrigen.cliente_id]
                );
                pedidoDestinoId = insert.insertId;
            }

            await connection.query(`UPDATE pedido_items SET pedido_id = ? WHERE id IN (?) AND pedido_id = ?`, [
                pedidoDestinoId,
                itemIds,
                pedidoOrigenId
            ]);

            const [restantes] = await connection.query(
                `SELECT COUNT(*) as cnt FROM pedido_items WHERE pedido_id = ? AND estado <> 'cancelado'`,
                [pedidoOrigenId]
            );

            if ((restantes[0]?.cnt || 0) === 0) {
                await connection.query(`UPDATE pedidos SET estado = 'cancelado' WHERE id = ?`, [pedidoOrigenId]);
                const [abiertosOrigen] = await connection.query(
                    `SELECT COUNT(*) as cnt FROM pedidos WHERE mesa_id = ? AND estado NOT IN ('cerrado','cancelado')`,
                    [pedidoOrigen.mesa_id]
                );
                if ((abiertosOrigen[0]?.cnt || 0) === 0) {
                    await connection.query('UPDATE mesas SET estado = "libre" WHERE id = ?', [pedidoOrigen.mesa_id]);
                }
            }

            await connection.query('UPDATE mesas SET estado = "ocupada" WHERE id = ?', [mesa_destino_id]);

            await connection.commit();
            RealtimeEvents.emitMesasChanged(tenantId);

            return { success: true, message: 'Productos movidos exitosamente' };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }
}

module.exports = MoverItemsService;
