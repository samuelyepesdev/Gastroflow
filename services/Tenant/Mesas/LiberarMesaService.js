const db = require('../../../config/database');

class LiberarMesaService {
    /**
     * @description Libera de forma transaccional una mesa
     */
    static async execute({ tenantId, mesaId }) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const [mesas] = await connection.query('SELECT id FROM mesas WHERE id = ? AND tenant_id = ?', [
                mesaId,
                tenantId
            ]);
            if (mesas.length === 0) {
                throw new Error('Mesa no encontrada');
            }

            const [abiertos] = await connection.query(
                `SELECT p.id FROM pedidos p WHERE p.mesa_id = ? AND p.estado NOT IN ('cerrado','cancelado') FOR UPDATE`,
                [mesaId]
            );

            if (abiertos.length > 0) {
                const ids = abiertos.map(p => p.id);
                const [items] = await connection.query(
                    `SELECT COUNT(*) as cnt FROM pedido_items WHERE pedido_id IN (?) AND estado <> 'cancelado'`,
                    [ids]
                );
                if ((items[0]?.cnt || 0) > 0) {
                    throw new Error('La mesa tiene items activos, no se puede liberar');
                }

                await connection.query(`UPDATE pedidos SET estado = 'cancelado' WHERE id IN (?)`, [ids]);
            }

            await connection.query(
                `UPDATE mesas SET estado = 'libre', qr_session_id = NULL, last_qr_activity = NULL WHERE id = ?`,
                [mesaId]
            );

            await connection.commit();

            // Emitir evento SSE para notificar en tiempo real que se liberó la mesa
            try {
                const WhatsAppService = require('../WhatsAppService');
                WhatsAppService.events.emit('orderCreated', {
                    tenantId,
                    mesaId,
                    action: 'cancelled'
                });
            } catch (err) {
                console.error('Error al emitir evento de liberación SSE:', err);
            }

            return { message: 'Mesa liberada' };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }
}

module.exports = LiberarMesaService;
