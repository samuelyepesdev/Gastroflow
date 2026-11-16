const db = require('../../../config/database');
const RealtimeEvents = require('../../Shared/RealtimeEvents');
const { ValidationError, NotFoundError, ConflictError } = require('../../../utils/errors');

class MoverItemsService {
    /**
     * @description Mueve items específicos de un pedido a otra mesa. (Separador de cuentas)
     */
    static async execute({ tenantId, pedidoOrigenId, itemIds, mesa_destino_id }) {
        if (!Array.isArray(itemIds) || itemIds.length === 0) {
            throw new ValidationError('Seleccione al menos un producto', 'ITEMS_REQUERIDOS');
        }
        const idsUnicos = [...new Set(itemIds.map(Number))];

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const [pedidos] = await connection.query(
                'SELECT * FROM pedidos WHERE id = ? AND tenant_id = ? FOR UPDATE',
                [pedidoOrigenId, tenantId]
            );
            if (pedidos.length === 0) {
                throw new NotFoundError('Pedido origen no encontrado', 'PEDIDO_NO_ENCONTRADO');
            }
            const pedidoOrigen = pedidos[0];
            // Un pedido ya facturado o cancelado no se reparte: sus líneas son historia contable.
            if (['cerrado', 'cancelado'].includes(pedidoOrigen.estado)) {
                throw new ConflictError('El pedido de origen ya está cerrado o cancelado', 'PEDIDO_CERRADO');
            }

            const [mesaDest] = await connection.query('SELECT id, numero FROM mesas WHERE id = ? AND tenant_id = ?', [
                mesa_destino_id,
                tenantId
            ]);
            if (mesaDest.length === 0) {
                throw new NotFoundError('Mesa destino no encontrada', 'MESA_NO_ENCONTRADA');
            }

            // Con tenant_id y FOR UPDATE: otro mesero que abre o cierra la mesa destino a la vez espera a este
            // movimiento (antes los dos podían crear un pedido abierto en la misma mesa).
            const [pedidoDest] = await connection.query(
                `SELECT id FROM pedidos WHERE mesa_id = ? AND tenant_id = ? AND estado NOT IN ('cerrado','cancelado') LIMIT 1 FOR UPDATE`,
                [mesa_destino_id, tenantId]
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

            const [movidos] = await connection.query(
                `UPDATE pedido_items SET pedido_id = ? WHERE id IN (?) AND pedido_id = ?`,
                [pedidoDestinoId, idsUnicos, pedidoOrigenId]
            );
            // Si algún producto ya no está en este pedido (otro mesero lo movió o lo eliminó) se avisa en vez de
            // ignorarlo en silencio; el rollback deshace además el pedido vacío que se pudo haber creado arriba.
            if (movidos.affectedRows !== idsUnicos.length) {
                throw new ConflictError(
                    'Algunos productos ya no están en este pedido. Actualiza la mesa e inténtalo de nuevo',
                    'ITEMS_NO_DISPONIBLES'
                );
            }

            // pedidos.total es un acumulado (lo escriben el POS y el menú QR): se recalcula en los dos pedidos
            // para que no queden con el valor de antes del movimiento.
            for (const id of [pedidoOrigenId, pedidoDestinoId]) {
                await connection.query(
                    `UPDATE pedidos SET total = (
                         SELECT COALESCE(SUM(subtotal), 0) FROM pedido_items WHERE pedido_id = ? AND estado <> 'cancelado'
                     ) WHERE id = ? AND tenant_id = ?`,
                    [id, id, tenantId]
                );
            }

            const [restantes] = await connection.query(
                `SELECT COUNT(*) as cnt FROM pedido_items WHERE pedido_id = ? AND estado <> 'cancelado'`,
                [pedidoOrigenId]
            );

            if ((restantes[0]?.cnt || 0) === 0) {
                await connection.query(`UPDATE pedidos SET estado = 'cancelado' WHERE id = ?`, [pedidoOrigenId]);
                const [abiertosOrigen] = await connection.query(
                    `SELECT COUNT(*) as cnt FROM pedidos WHERE mesa_id = ? AND tenant_id = ? AND estado NOT IN ('cerrado','cancelado')`,
                    [pedidoOrigen.mesa_id, tenantId]
                );
                if ((abiertosOrigen[0]?.cnt || 0) === 0) {
                    await connection.query('UPDATE mesas SET estado = "libre" WHERE id = ? AND tenant_id = ?', [
                        pedidoOrigen.mesa_id,
                        tenantId
                    ]);
                }
            }

            await connection.query('UPDATE mesas SET estado = "ocupada" WHERE id = ? AND tenant_id = ?', [
                mesa_destino_id,
                tenantId
            ]);

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
