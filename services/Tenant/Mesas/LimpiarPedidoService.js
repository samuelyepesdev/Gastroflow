const db = require('../../../config/database');

class LimpiarPedidoService {
    /**
     * @description Elimina todos los items de un pedido y resetea su total a 0
     */
    static async execute({ tenantId, pedidoId }) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            // 1. Verificar existencia y pertenencia
            const [pedidos] = await connection.query(
                'SELECT id, mesa_id FROM pedidos WHERE id = ? AND tenant_id = ? FOR UPDATE',
                [pedidoId, tenantId]
            );
            if (pedidos.length === 0) throw new Error('Pedido no encontrado');
            
            const mesaId = pedidos[0].mesa_id;

            // 2. Eliminar items (o marcarlos como cancelados si se desea historial, 
            // pero para "limpiar" suele ser un reset total)
            await connection.query(
                'DELETE FROM pedido_items WHERE pedido_id = ? AND tenant_id = ?',
                [pedidoId, tenantId]
            );

            // 3. Resetear total del pedido
            await connection.query(
                'UPDATE pedidos SET total = 0, propina = 0 WHERE id = ?',
                [pedidoId]
            );

            // 4. Asegurar que el estado de la mesa refleje que está "ocupada" pero vacía, 
            // o si el usuario prefiere liberarla, se podría hacer opcional.
            // Por defecto mantendremos la mesa pero vacía.

            await connection.commit();
            return { message: 'Pedido vaciado correctamente', mesaId };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }
}

module.exports = LimpiarPedidoService;
