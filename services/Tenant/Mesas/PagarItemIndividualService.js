const db = require('../../../config/database');

class PagarItemIndividualService {
    /**
     * @description Marca un item individual como pagado.
     */
    static async execute({ tenantId, itemId, forma_pago }) {
        if (!forma_pago || !['efectivo', 'transferencia'].includes(forma_pago)) {
            throw new Error('Forma de pago requerida y debe ser efectivo o transferencia');
        }

        const [rows] = await db.query(
            'SELECT pi.id FROM pedido_items pi INNER JOIN pedidos p ON pi.pedido_id = p.id WHERE pi.id = ? AND p.tenant_id = ?',
            [itemId, tenantId]
        );
        if (rows.length === 0) throw new Error('Item no encontrado');

        await db.query(
            `UPDATE pedido_items SET pagado = 1, forma_pago = ? WHERE id = ?`,
            [forma_pago, itemId]
        );

        return { message: 'Item pagado correctamente' };
    }
}

module.exports = PagarItemIndividualService;
