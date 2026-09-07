const db = require('../../../config/database');

class AbrirPedidoService {
    /**
     * @description Inicia un nuevo pedido de facturación en una mesa de forma transaccional.
     */
    static async execute({ tenantId, mesa_id, cliente_id, notas }) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const [mesas] = await connection.query('SELECT id FROM mesas WHERE id = ? AND tenant_id = ?', [
                mesa_id,
                tenantId
            ]);
            if (mesas.length === 0) {
                throw new Error('Mesa no encontrada');
            }

            const [existentes] = await connection.query(
                `SELECT * FROM pedidos WHERE mesa_id = ? AND estado NOT IN ('cerrado','cancelado') LIMIT 1`,
                [mesa_id]
            );

            if (existentes.length > 0) {
                // Re-asegurar que la mesa refleje que tiene un pedido vivo. Si quedó
                // en 'libre' (p. ej. otro pedido de la misma mesa se facturó y liberó
                // la mesa sin cancelar este), el vigilante de refreshMesas lo tomaría
                // como "facturada por otro" y cerraría el panel al instante.
                await connection.query("UPDATE mesas SET estado = 'ocupada' WHERE id = ? AND estado <> 'ocupada'", [
                    mesa_id
                ]);
                await connection.commit();
                return existentes[0];
            }

            // Obtener siguiente número de pedido para este tenant (correlativo interno,
            // reiniciado cada día como un ticket de cocina)
            const [numResult] = await connection.query(
                `SELECT COALESCE(MAX(numero), 0) + 1 AS siguiente FROM pedidos WHERE tenant_id = ? AND DATE(created_at) = CURDATE()`,
                [tenantId]
            );
            const siguienteNumero = numResult[0].siguiente;

            const [insert] = await connection.query(
                `INSERT INTO pedidos (tenant_id, mesa_id, cliente_id, estado, total, notas, numero) VALUES (?, ?, ?, 'abierto', 0, ?, ?)`,
                [tenantId, mesa_id, cliente_id || null, notas || null, siguienteNumero]
            );

            await connection.query("UPDATE mesas SET estado = 'ocupada' WHERE id = ?", [mesa_id]);

            await connection.commit();

            return {
                id: insert.insertId,
                numero: siguienteNumero,
                mesa_id,
                cliente_id: cliente_id || null,
                estado: 'abierto',
                total: 0,
                notas: notas || null
            };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }
}

module.exports = AbrirPedidoService;
