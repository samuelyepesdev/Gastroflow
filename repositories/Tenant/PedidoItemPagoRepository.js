/**
 * PedidoItemPagoRepository - Auditoría de pagos "por producto" (PagarItemIndividualService).
 * A diferencia de pedido_items.pagado (que se fusiona/borra al pagar más unidades del
 * mismo producto), cada fila acá es un evento inmutable: cuándo, quién, cuánto y en qué
 * producto -- misma idea que PedidoAbonoRepository y bono_movimientos.
 */
const db = require('../../config/database');

class PedidoItemPagoRepository {
    static async create({ tenantId, pedidoId, productoId, cantidad, monto, formaPago, usuarioId }, connection = null) {
        const [result] = await (connection || db).query(
            `INSERT INTO pedido_item_pagos (tenant_id, pedido_id, producto_id, cantidad, monto, forma_pago, usuario_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [tenantId, pedidoId, productoId || null, cantidad, monto, formaPago, usuarioId || null]
        );
        return result.insertId;
    }

    /** Vincula los pagos por producto del pedido a la factura recién creada (trazabilidad). */
    static async marcarFacturados(pedidoId, facturaId, connection) {
        await (connection || db).query(`UPDATE pedido_item_pagos SET factura_id = ? WHERE pedido_id = ?`, [
            facturaId,
            pedidoId
        ]);
    }

    static async findByFactura(facturaId, tenantId) {
        const [rows] = await db.query(
            `SELECT pip.*, p.nombre AS producto_nombre, u.nombre_completo AS usuario_nombre
             FROM pedido_item_pagos pip
             LEFT JOIN productos p ON p.id = pip.producto_id
             LEFT JOIN usuarios u ON u.id = pip.usuario_id
             WHERE pip.factura_id = ? AND pip.tenant_id = ?
             ORDER BY pip.created_at ASC`,
            [facturaId, tenantId]
        );
        return rows;
    }
}

module.exports = PedidoItemPagoRepository;
