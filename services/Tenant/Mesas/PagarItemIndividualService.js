const db = require('../../../config/database');
const PedidoItemPagoRepository = require('../../../repositories/Tenant/PedidoItemPagoRepository');
const ComboVentaRepository = require('../../../repositories/Tenant/ComboVentaRepository');
const RealtimeEvents = require('../../Shared/RealtimeEvents');

class PagarItemIndividualService {
    /**
     * @description Marca un item individual como pagado o parcialmente pagado.
     */
    static async execute({ tenantId, itemId, forma_pago, cantidad, skipEvent, usuarioId = null }) {
        if (!forma_pago || !['efectivo', 'transferencia'].includes(forma_pago)) {
            throw new Error('Forma de pago requerida y debe ser efectivo o transferencia');
        }

        const [rows] = await db.query(
            `SELECT pi.id, pi.cantidad, pi.precio_unitario, pi.pedido_id, pi.producto_id, pi.combo_id, pi.unidad_medida, pi.estado, pi.nota, pi.enviado_at, pi.preparado_at, pi.listo_at, pi.servido_at, pi.subtotal, pi.modificadores_hash, p.mesa_id
             FROM pedido_items pi
             INNER JOIN pedidos p ON pi.pedido_id = p.id
             WHERE pi.id = ? AND p.tenant_id = ?`,
            [itemId, tenantId]
        );
        if (rows.length === 0) {
            throw new Error('Item no encontrado');
        }
        const item = rows[0];

        // Solo se fusiona con una fila ya pagada del MISMO producto, precio y
        // modificadores: dos líneas del mismo producto con distinto topping (por
        // tanto distinto precio_unitario) son ventas distintas. Fusionarlas por
        // producto_id nada más sumaba cantidades bajo el precio_unitario de la
        // primera fila pagada (la factura recalcula cantidad * precio_unitario)
        // e inflaba/descuadraba el total, además de perder los modificadores de
        // la fila fusionada al hacer DELETE (cascada en pedido_item_modificadores).
        const [existingPaidRows] = await db.query(
            `SELECT id, cantidad, subtotal
             FROM pedido_items
             WHERE pedido_id = ? AND producto_id = ? AND pagado = 1 AND forma_pago = ?
               AND precio_unitario = ? AND modificadores_hash <=> ? LIMIT 1`,
            [item.pedido_id, item.producto_id, forma_pago, item.precio_unitario, item.modificadores_hash]
        );

        const cant = Number.parseFloat(cantidad || 0);
        const cantToPay =
            cant > 0 && cant <= Number.parseFloat(item.cantidad) ? cant : Number.parseFloat(item.cantidad);

        if (existingPaidRows.length > 0) {
            const existingPaid = existingPaidRows[0];
            if (cantToPay < Number.parseFloat(item.cantidad)) {
                // Disminuir la parte no pagada del item actual
                const leftoverCantidad = Number.parseFloat(item.cantidad) - cantToPay;
                const leftoverSubtotal = leftoverCantidad * Number.parseFloat(item.precio_unitario);
                await db.query(`UPDATE pedido_items SET cantidad = ?, subtotal = ? WHERE id = ?`, [
                    leftoverCantidad,
                    leftoverSubtotal,
                    itemId
                ]);

                // Incrementar la fila ya pagada existente
                const newPaidCantidad = Number.parseFloat(existingPaid.cantidad) + cantToPay;
                const newPaidSubtotal =
                    Number.parseFloat(existingPaid.subtotal) + cantToPay * Number.parseFloat(item.precio_unitario);
                await db.query(`UPDATE pedido_items SET cantidad = ?, subtotal = ? WHERE id = ?`, [
                    newPaidCantidad,
                    newPaidSubtotal,
                    existingPaid.id
                ]);
            } else {
                // se ha pagado, así que se elimina esta fila de pedido_items ya que su contenido se fusiona
                const newPaidCantidad = Number.parseFloat(existingPaid.cantidad) + Number.parseFloat(item.cantidad);
                const newPaidSubtotal =
                    Number.parseFloat(existingPaid.subtotal) +
                    Number.parseFloat(
                        item.subtotal || Number.parseFloat(item.cantidad) * Number.parseFloat(item.precio_unitario)
                    );
                await db.query(`UPDATE pedido_items SET cantidad = ?, subtotal = ? WHERE id = ?`, [
                    newPaidCantidad,
                    newPaidSubtotal,
                    existingPaid.id
                ]);
                await db.query(`DELETE FROM pedido_items WHERE id = ?`, [itemId]);
            }
        } else if (cantToPay < Number.parseFloat(item.cantidad)) {
            // No hay ninguna fila ya pagada para este producto. Usamos la lógica anterior.
            const leftoverCantidad = Number.parseFloat(item.cantidad) - cantToPay;
            const leftoverSubtotal = leftoverCantidad * Number.parseFloat(item.precio_unitario);
            const paidSubtotal = cantToPay * Number.parseFloat(item.precio_unitario);

            await db.query(
                `UPDATE pedido_items SET cantidad = ?, subtotal = ?, pagado = 1, forma_pago = ? WHERE id = ?`,
                [cantToPay, paidSubtotal, forma_pago, itemId]
            );

            const [leftoverInsert] = await db.query(
                `INSERT INTO pedido_items (tenant_id, pedido_id, producto_id, combo_id, cantidad, unidad_medida, precio_unitario, subtotal, estado, nota, modificadores_hash, enviado_at, preparado_at, listo_at, servido_at, pagado, forma_pago)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)`,
                [
                    tenantId,
                    item.pedido_id,
                    item.producto_id,
                    item.combo_id,
                    leftoverCantidad,
                    item.unidad_medida,
                    item.precio_unitario,
                    leftoverSubtotal,
                    item.estado,
                    item.nota,
                    item.modificadores_hash,
                    item.enviado_at,
                    item.preparado_at,
                    item.listo_at,
                    item.servido_at
                ]
            );

            // La fila original (itemId) se queda con la porción PAGADA y conserva
            // sus pedido_item_modificadores; la porción sin pagar es una fila nueva
            // y necesita su propia copia de los toppings, si no los pierde.
            const [modsOriginales] = await db.query(
                `SELECT opcion_modificador_id, grupo_nombre, opcion_nombre, precio_adicional, cantidad, insumo_id, cantidad_insumo, unidad_insumo
                 FROM pedido_item_modificadores WHERE pedido_item_id = ?`,
                [itemId]
            );
            if (modsOriginales.length > 0) {
                const modsValues = modsOriginales.map(m => [
                    leftoverInsert.insertId,
                    m.opcion_modificador_id,
                    m.grupo_nombre,
                    m.opcion_nombre,
                    m.precio_adicional,
                    m.cantidad,
                    m.insumo_id,
                    m.cantidad_insumo,
                    m.unidad_insumo
                ]);
                await db.query(
                    `INSERT INTO pedido_item_modificadores (pedido_item_id, opcion_modificador_id, grupo_nombre, opcion_nombre, precio_adicional, cantidad, insumo_id, cantidad_insumo, unidad_insumo) VALUES ?`,
                    [modsValues]
                );
            }

            // Lo elegido en un combo armado también se parte: la porción sin pagar necesita su copia.
            if (item.combo_id) {
                const selecciones = (await ComboVentaRepository.getSeleccionesPorItems([itemId])).get(itemId) || [];
                await ComboVentaRepository.guardarSeleccionesPedidoItem(leftoverInsert.insertId, selecciones);
            }
        } else {
            await db.query(`UPDATE pedido_items SET pagado = 1, forma_pago = ? WHERE id = ?`, [forma_pago, itemId]);
        }

        // Auditoría del pago (independiente de cómo haya quedado pedido_items
        // arriba -- esa fila se fusiona/parte con otras del mismo producto, así
        // que es la única forma de conservar el evento con fecha y usuario).
        try {
            await PedidoItemPagoRepository.create({
                tenantId,
                pedidoId: item.pedido_id,
                productoId: item.producto_id,
                cantidad: cantToPay,
                monto: cantToPay * Number.parseFloat(item.precio_unitario),
                formaPago: forma_pago,
                usuarioId
            });
        } catch (auditErr) {
            // eslint-disable-next-line no-console
            console.error('Error al registrar auditoría de pago por producto (no bloqueante):', auditErr);
        }

        if (!skipEvent) {
            // Emitir evento SSE
            RealtimeEvents.emitPedido({
                tenantId,
                pedidoId: item.pedido_id,
                mesaId: item.mesa_id,
                action: 'items_updated'
            });
        }

        return { message: 'Item pagado correctamente' };
    }
}

module.exports = PagarItemIndividualService;
