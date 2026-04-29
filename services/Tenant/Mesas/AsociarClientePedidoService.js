const db = require('../../../config/database');

class AsociarClientePedidoService {
    /**
     * @description Asocia un cliente a un pedido específico.
     */
    static async execute({ tenantId, pedidoId, cliente_id }) {
        let clienteAsociado = null;
        
        if (cliente_id !== null && cliente_id !== undefined) {
            const [rows] = await db.query(
                'SELECT id, nombre FROM clientes WHERE id = ? AND tenant_id = ?', 
                [cliente_id, tenantId]
            );
            if (rows.length === 0) throw new Error('Cliente no encontrado');
            clienteAsociado = rows[0];
        }

        const [result] = await db.query(
            'UPDATE pedidos SET cliente_id = ? WHERE id = ? AND tenant_id = ?',
            [cliente_id, pedidoId, tenantId]
        );

        if (result.affectedRows === 0) throw new Error('Pedido no encontrado');
        
        return { message: 'Cliente asociado al pedido', cliente: clienteAsociado };
    }
}

module.exports = AsociarClientePedidoService;
