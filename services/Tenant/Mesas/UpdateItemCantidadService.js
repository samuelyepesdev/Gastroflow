const db = require('../../../config/database');

class UpdateItemCantidadService {
    /**
     * @description Actualiza la cantidad y subtotal de un item del pedido.
     */
    static async execute({ tenantId, itemId, cantidad }) {
        const cant = parseFloat(cantidad);
        if (isNaN(cant) || cant < 0.01) {
            throw new Error('Cantidad inválida (mínimo 0.01)');
        }

        const [checkRows] = await db.query(
            'SELECT pi.id, pi.precio_unitario FROM pedido_items pi INNER JOIN pedidos p ON pi.pedido_id = p.id WHERE pi.id = ? AND p.tenant_id = ?',
            [itemId, tenantId]
        );
        
        if (checkRows.length === 0) {
            throw new Error('Item no encontrado');
        }

        const precio = Number(checkRows[0].precio_unitario);
        const subtotal = (cant * precio).toFixed(2);
        
        await db.query(
            'UPDATE pedido_items SET cantidad = ?, subtotal = ? WHERE id = ?',
            [cant, subtotal, itemId]
        );

        return { message: 'Cantidad actualizada', subtotal: parseFloat(subtotal) };
    }
}

module.exports = UpdateItemCantidadService;
