const db = require('../../../config/database');
const PedidoItemPagoRepository = require('../../../repositories/Tenant/PedidoItemPagoRepository');
const ComboVentaRepository = require('../../../repositories/Tenant/ComboVentaRepository');
const RealtimeEvents = require('../../Shared/RealtimeEvents');
const { ValidationError, NotFoundError, ConflictError } = require('../../../utils/errors');

const FORMAS_PAGO = ['efectivo', 'transferencia'];

class PagarItemIndividualService {
    /**
     * @description Marca un item individual como pagado o parcialmente pagado.
     * Todo el pago (partir la línea, fusionar con la ya pagada, copiar toppings/combos y auditoría) es UNA
     * transacción con la línea bloqueada: un fallo a medias no deja unidades perdidas y un doble clic no puede
     * pagar dos veces la misma línea.
     * @param {Object} [param0.conn] - transacción ajena (pago de varios ítems): se usa tal cual y quien la abrió
     *   hace el commit/rollback y emite el evento.
     */
    static async execute({ tenantId, itemId, forma_pago, cantidad, skipEvent, usuarioId = null, conn = null }) {
        if (!forma_pago || !FORMAS_PAGO.includes(forma_pago)) {
            throw new ValidationError('Forma de pago requerida y debe ser efectivo o transferencia', 'FORMA_PAGO');
        }

        let item;
        if (conn) {
            item = await PagarItemIndividualService._pagar(conn, { tenantId, itemId, forma_pago, cantidad, usuarioId });
        } else {
            const propia = await db.getConnection();
            try {
                await propia.beginTransaction();
                item = await PagarItemIndividualService._pagar(propia, {
                    tenantId,
                    itemId,
                    forma_pago,
                    cantidad,
                    usuarioId
                });
                await propia.commit();
            } catch (error) {
                await propia.rollback();
                throw error;
            } finally {
                propia.release();
            }
        }

        if (!skipEvent) {
            // Tras el commit: la venta ya está guardada y el aviso en tiempo real nunca la tumba.
            RealtimeEvents.emitPedido({
                tenantId,
                pedidoId: item.pedido_id,
                mesaId: item.mesa_id,
                action: 'items_updated'
            });
        }

        return { message: 'Item pagado correctamente' };
    }

    /** Escribe el pago con `connection` (la transacción). Devuelve la línea original (pedido_id, mesa_id). */
    static async _pagar(connection, { tenantId, itemId, forma_pago, cantidad, usuarioId }) {
        // FOR UPDATE: dos pagos simultáneos de la misma línea se ponen en fila; el segundo ya la ve pagada.
        const [rows] = await connection.query(
            `SELECT pi.id, pi.cantidad, pi.precio_unitario, pi.pedido_id, pi.producto_id, pi.combo_id, pi.unidad_medida, pi.estado, pi.nota, pi.enviado_at, pi.preparado_at, pi.listo_at, pi.servido_at, pi.subtotal, pi.modificadores_hash, pi.pagado, p.mesa_id, p.estado AS pedido_estado
             FROM pedido_items pi
             INNER JOIN pedidos p ON pi.pedido_id = p.id
             WHERE pi.id = ? AND p.tenant_id = ?
             FOR UPDATE`,
            [itemId, tenantId]
        );
        if (rows.length === 0) {
            throw new NotFoundError('Item no encontrado', 'ITEM_NO_ENCONTRADO');
        }
        const item = rows[0];
        if (['cerrado', 'cancelado'].includes(item.pedido_estado)) {
            throw new ConflictError('El pedido ya está cerrado o cancelado', 'PEDIDO_CERRADO');
        }
        if (Number(item.pagado) === 1) {
            // Sin esto, la búsqueda de "fila ya pagada" encontraba a la propia línea, duplicaba su cantidad y la borraba.
            throw new ConflictError('Este ítem ya fue pagado', 'ITEM_YA_PAGADO');
        }

        // Solo se fusiona con una fila ya pagada del MISMO producto, precio y
        // modificadores: dos líneas del mismo producto con distinto topping (por
        // tanto distinto precio_unitario) son ventas distintas. Fusionarlas por
        // producto_id nada más sumaba cantidades bajo el precio_unitario de la
        // primera fila pagada (la factura recalcula cantidad * precio_unitario)
        // e inflaba/descuadraba el total, además de perder los modificadores de
        // la fila fusionada al hacer DELETE (cascada en pedido_item_modificadores).
        const [existingPaidRows] = await connection.query(
            `SELECT id, cantidad, subtotal
             FROM pedido_items
             WHERE pedido_id = ? AND producto_id = ? AND pagado = 1 AND forma_pago = ?
               AND precio_unitario = ? AND modificadores_hash <=> ? AND id <> ? LIMIT 1
             FOR UPDATE`,
            [item.pedido_id, item.producto_id, forma_pago, item.precio_unitario, item.modificadores_hash, itemId]
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
                await connection.query(`UPDATE pedido_items SET cantidad = ?, subtotal = ? WHERE id = ?`, [
                    leftoverCantidad,
                    leftoverSubtotal,
                    itemId
                ]);

                // Incrementar la fila ya pagada existente
                const newPaidCantidad = Number.parseFloat(existingPaid.cantidad) + cantToPay;
                const newPaidSubtotal =
                    Number.parseFloat(existingPaid.subtotal) + cantToPay * Number.parseFloat(item.precio_unitario);
                await connection.query(`UPDATE pedido_items SET cantidad = ?, subtotal = ? WHERE id = ?`, [
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
                await connection.query(`UPDATE pedido_items SET cantidad = ?, subtotal = ? WHERE id = ?`, [
                    newPaidCantidad,
                    newPaidSubtotal,
                    existingPaid.id
                ]);
                await connection.query(`DELETE FROM pedido_items WHERE id = ?`, [itemId]);
            }
        } else if (cantToPay < Number.parseFloat(item.cantidad)) {
            // No hay ninguna fila ya pagada para este producto. Usamos la lógica anterior.
            const leftoverCantidad = Number.parseFloat(item.cantidad) - cantToPay;
            const leftoverSubtotal = leftoverCantidad * Number.parseFloat(item.precio_unitario);
            const paidSubtotal = cantToPay * Number.parseFloat(item.precio_unitario);

            await connection.query(
                `UPDATE pedido_items SET cantidad = ?, subtotal = ?, pagado = 1, forma_pago = ? WHERE id = ?`,
                [cantToPay, paidSubtotal, forma_pago, itemId]
            );

            const [leftoverInsert] = await connection.query(
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
            const [modsOriginales] = await connection.query(
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
                await connection.query(
                    `INSERT INTO pedido_item_modificadores (pedido_item_id, opcion_modificador_id, grupo_nombre, opcion_nombre, precio_adicional, cantidad, insumo_id, cantidad_insumo, unidad_insumo) VALUES ?`,
                    [modsValues]
                );
            }

            // Lo elegido en un combo armado también se parte: la porción sin pagar necesita su copia.
            if (item.combo_id) {
                const selecciones =
                    (await ComboVentaRepository.getSeleccionesPorItems([itemId], connection)).get(itemId) || [];
                await ComboVentaRepository.guardarSeleccionesPedidoItem(
                    leftoverInsert.insertId,
                    selecciones,
                    connection
                );
            }
        } else {
            await connection.query(`UPDATE pedido_items SET pagado = 1, forma_pago = ? WHERE id = ?`, [
                forma_pago,
                itemId
            ]);
        }

        // Auditoría del pago (independiente de cómo haya quedado pedido_items
        // arriba -- esa fila se fusiona/parte con otras del mismo producto, así
        // que es la única forma de conservar el evento con fecha y usuario).
        // Sigue siendo no bloqueante (como antes): un INSERT fallido no aborta la transacción en MySQL.
        try {
            await PedidoItemPagoRepository.create(
                {
                    tenantId,
                    pedidoId: item.pedido_id,
                    productoId: item.producto_id,
                    cantidad: cantToPay,
                    monto: cantToPay * Number.parseFloat(item.precio_unitario),
                    formaPago: forma_pago,
                    usuarioId
                },
                connection
            );
        } catch (auditErr) {
            // eslint-disable-next-line no-console
            console.error('Error al registrar auditoría de pago por producto (no bloqueante):', auditErr);
        }

        return item;
    }
}

module.exports = PagarItemIndividualService;
