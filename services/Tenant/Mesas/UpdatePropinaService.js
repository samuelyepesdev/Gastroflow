const db = require('../../../config/database');

class UpdatePropinaService {
    /**
     * @description Actualiza el monto de la propina en un pedido.
     */
    static async execute({ tenantId, pedidoId, propina }) {
        const montoPropina = Math.max(0, parseFloat(propina) || 0);
        
        const [result] = await db.query(
            'UPDATE pedidos SET propina = ? WHERE id = ? AND tenant_id = ?',
            [montoPropina, pedidoId, tenantId]
        );
        
        if (result.affectedRows === 0) throw new Error('Pedido no encontrado');
        
        return { propina: montoPropina };
    }
}

module.exports = UpdatePropinaService;
