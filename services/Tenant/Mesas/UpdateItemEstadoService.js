const db = require('../../../config/database');

class UpdateItemEstadoService {
    /**
     * @description Actualiza el estado (cocina/servicio) de un item del pedido.
     */
    static async execute({ tenantId, itemId, estado }) {
        const [rows] = await db.query(
            'SELECT pi.id FROM pedido_items pi INNER JOIN pedidos p ON pi.pedido_id = p.id WHERE pi.id = ? AND p.tenant_id = ?',
            [itemId, tenantId]
        );
        if (rows.length === 0) throw new Error('Item no encontrado');

        const permitidos = ['pendiente', 'enviado', 'preparando', 'listo', 'servido', 'cancelado'];
        if (!permitidos.includes(estado)) throw new Error('Estado inválido');

        let timestampField = null;
        if (estado === 'enviado') timestampField = 'enviado_at';
        if (estado === 'preparando') timestampField = 'preparado_at';
        if (estado === 'listo') timestampField = 'listo_at';
        if (estado === 'servido') timestampField = 'servido_at';

        if (timestampField) {
            await db.query(
                `UPDATE pedido_items SET estado = ?, ${timestampField} = NOW() WHERE id = ?`,
                [estado, itemId]
            );
        } else {
            await db.query(`UPDATE pedido_items SET estado = ? WHERE id = ?`, [estado, itemId]);
        }

        return { message: 'Estado actualizado', estado };
    }
}

module.exports = UpdateItemEstadoService;
