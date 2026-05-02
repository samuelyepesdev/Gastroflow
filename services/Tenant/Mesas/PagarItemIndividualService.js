const db = require('../../../config/database');

class PagarItemIndividualService {
    /**
     * @description Marca un item individual como pagado o parcialmente pagado.
     */
    static async execute({ tenantId, itemId, forma_pago, cantidad }) {
        if (!forma_pago || !['efectivo', 'transferencia'].includes(forma_pago)) {
            throw new Error('Forma de pago requerida y debe ser efectivo o transferencia');
        }

        const [rows] = await db.query(
            `SELECT pi.id, pi.cantidad, pi.precio_unitario, pi.pedido_id, pi.producto_id, pi.unidad_medida, pi.estado, pi.nota, pi.enviado_at, pi.preparado_at, pi.listo_at, pi.servido_at, pi.subtotal 
             FROM pedido_items pi 
             INNER JOIN pedidos p ON pi.pedido_id = p.id 
             WHERE pi.id = ? AND p.tenant_id = ?`,
            [itemId, tenantId]
        );
        if (rows.length === 0) throw new Error('Item no encontrado');
        const item = rows[0];

        const [existingPaidRows] = await db.query(
            `SELECT id, cantidad, subtotal 
             FROM pedido_items 
             WHERE pedido_id = ? AND producto_id = ? AND pagado = 1 AND forma_pago = ? LIMIT 1`,
            [item.pedido_id, item.producto_id, forma_pago]
        );

        const cant = parseFloat(cantidad || 0);
        const cantToPay = cant > 0 && cant <= parseFloat(item.cantidad) ? cant : parseFloat(item.cantidad);

        if (existingPaidRows.length > 0) {
            const existingPaid = existingPaidRows[0];
            if (cantToPay < parseFloat(item.cantidad)) {
                // Disminuir la parte no pagada del item actual
                const leftoverCantidad = parseFloat(item.cantidad) - cantToPay;
                const leftoverSubtotal = leftoverCantidad * parseFloat(item.precio_unitario);
                await db.query(
                    `UPDATE pedido_items SET cantidad = ?, subtotal = ? WHERE id = ?`,
                    [leftoverCantidad, leftoverSubtotal, itemId]
                );

                // Incrementar la fila ya pagada existente
                const newPaidCantidad = parseFloat(existingPaid.cantidad) + cantToPay;
                const newPaidSubtotal = parseFloat(existingPaid.subtotal) + (cantToPay * parseFloat(item.precio_unitario));
                await db.query(
                    `UPDATE pedido_items SET cantidad = ?, subtotal = ? WHERE id = ?`,
                    [newPaidCantidad, newPaidSubtotal, existingPaid.id]
                );
            } else {
                // Todo se ha pagado, así que se elimina esta fila de pedido_items ya que su contenido se fusiona
                const newPaidCantidad = parseFloat(existingPaid.cantidad) + parseFloat(item.cantidad);
                const newPaidSubtotal = parseFloat(existingPaid.subtotal) + parseFloat(item.subtotal || (parseFloat(item.cantidad) * parseFloat(item.precio_unitario)));
                await db.query(
                    `UPDATE pedido_items SET cantidad = ?, subtotal = ? WHERE id = ?`,
                    [newPaidCantidad, newPaidSubtotal, existingPaid.id]
                );
                await db.query(`DELETE FROM pedido_items WHERE id = ?`, [itemId]);
            }
        } else {
            // No hay ninguna fila ya pagada para este producto. Usamos la lógica anterior.
            if (cantToPay < parseFloat(item.cantidad)) {
                const leftoverCantidad = parseFloat(item.cantidad) - cantToPay;
                const leftoverSubtotal = leftoverCantidad * parseFloat(item.precio_unitario);
                const paidSubtotal = cantToPay * parseFloat(item.precio_unitario);

                await db.query(
                    `UPDATE pedido_items SET cantidad = ?, subtotal = ?, pagado = 1, forma_pago = ? WHERE id = ?`,
                    [cantToPay, paidSubtotal, forma_pago, itemId]
                );

                await db.query(
                    `INSERT INTO pedido_items (tenant_id, pedido_id, producto_id, cantidad, unidad_medida, precio_unitario, subtotal, estado, nota, enviado_at, preparado_at, listo_at, servido_at, pagado, forma_pago)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)`,
                    [
                        tenantId, item.pedido_id, item.producto_id, leftoverCantidad, item.unidad_medida,
                        item.precio_unitario, leftoverSubtotal, item.estado, item.nota,
                        item.enviado_at, item.preparado_at, item.listo_at, item.servido_at
                    ]
                );
            } else {
                await db.query(
                    `UPDATE pedido_items SET pagado = 1, forma_pago = ? WHERE id = ?`,
                    [forma_pago, itemId]
                );
            }
        }

        return { message: 'Item pagado correctamente' };
    }
}

module.exports = PagarItemIndividualService;
