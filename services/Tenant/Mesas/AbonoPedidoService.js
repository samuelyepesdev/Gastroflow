const db = require('../../../config/database');
const PedidoAbonoRepository = require('../../../repositories/Tenant/PedidoAbonoRepository');

const FORMAS_VALIDAS = ['efectivo', 'transferencia'];

class AbonoPedidoService {
    /**
     * @description Saldo pendiente del pedido: lo que falta por cobrar de los
     * PRODUCTOS, sin contar ítems ya marcados pagados (pago por producto) ni
     * abonos ya registrados. No aplica descuentos (esos solo se conocen al
     * facturar, igual que en el pago por producto existente) — es una cota
     * superior pensada para evitar abonos absurdos, no un cálculo fiscal
     * exacto.
     *
     * La propina queda fuera a propósito: se decide justo al cerrar la mesa
     * (ver FacturarPedidoService) y siempre se cobra completa con la forma de
     * pago del cierre, nunca con un abono anticipado — si se incluyera aquí, un
     * abono podría "cubrir" una propina que todavía no existe.
     */
    static async getSaldoPendiente(tenantId, pedidoId) {
        const [pedidos] = await db.query('SELECT id, propina, estado FROM pedidos WHERE id = ? AND tenant_id = ?', [
            pedidoId,
            tenantId
        ]);
        if (pedidos.length === 0) {
            throw new Error('Pedido no encontrado');
        }
        const pedido = pedidos[0];

        const [itemsRows] = await db.query(
            `SELECT COALESCE(SUM(subtotal), 0) AS total
             FROM pedido_items
             WHERE pedido_id = ? AND estado <> 'cancelado' AND pagado = 0`,
            [pedidoId]
        );
        const totalItemsPendientes = Number(itemsRows[0].total) || 0;

        const abonos = await PedidoAbonoRepository.sumByPedido(pedidoId, tenantId);
        const totalAbonado = abonos.efectivo + abonos.transferencia;

        const saldoPendiente = Math.max(0, Math.round((totalItemsPendientes - totalAbonado) * 100) / 100);

        return { pedido, saldoPendiente, totalAbonado, abonosPorMetodo: abonos };
    }

    /**
     * @description Registra un abono libre (monto suelto, no ligado a ningún
     * producto) contra el pedido. No lo marca facturado: solo queda como un
     * pago ya recibido que se descuenta del saldo, y que FacturarPedidoService
     * compone en `forma_pago`/montos de la factura final al cerrar la mesa.
     */
    static async registrar({ tenantId, pedidoId, monto, forma_pago, usuarioId, nota, totalVenta }) {
        if (!FORMAS_VALIDAS.includes(forma_pago)) {
            throw new Error('Forma de pago requerida y debe ser efectivo o transferencia');
        }
        const montoNum = Math.round((Number.parseFloat(monto) || 0) * 100) / 100;
        if (montoNum <= 0) {
            throw new Error('El monto del abono debe ser mayor a cero');
        }

        const { pedido, saldoPendiente: saldoItems, totalAbonado } = await this.getSaldoPendiente(tenantId, pedidoId);
        if (pedido.estado === 'cerrado' || pedido.estado === 'cancelado') {
            throw new Error('No se puede abonar a un pedido ya cerrado o cancelado');
        }
        // El POS aplica descuentos que el pedido no conoce: si manda el total real de la venta, el abono
        // tampoco puede pasarse de lo que falta de ese total.
        let saldoPendiente = saldoItems;
        const totalVentaNum = Number.parseFloat(totalVenta);
        if (Number.isFinite(totalVentaNum) && totalVentaNum >= 0) {
            saldoPendiente = Math.min(
                saldoPendiente,
                Math.max(0, Math.round((totalVentaNum - totalAbonado) * 100) / 100)
            );
        }
        if (montoNum > saldoPendiente) {
            throw new Error(`El abono no puede superar el saldo pendiente (${saldoPendiente})`);
        }

        const abonoId = await PedidoAbonoRepository.create({
            tenantId,
            pedidoId,
            monto: montoNum,
            forma_pago,
            usuarioId,
            nota
        });

        const { saldoPendiente: saldoRestante } = await this.getSaldoPendiente(tenantId, pedidoId);
        return { abono_id: abonoId, saldo_pendiente: saldoRestante };
    }

    static async listar(tenantId, pedidoId) {
        const abonos = await PedidoAbonoRepository.findByPedido(pedidoId, tenantId);
        const { saldoPendiente, totalAbonado } = await this.getSaldoPendiente(tenantId, pedidoId);
        return { abonos, saldo_pendiente: saldoPendiente, total_abonado: totalAbonado };
    }

    static async eliminar({ tenantId, abonoId }) {
        const abono = await PedidoAbonoRepository.findById(abonoId, tenantId);
        if (!abono) {
            throw new Error('Abono no encontrado');
        }
        const [pedidos] = await db.query('SELECT estado FROM pedidos WHERE id = ? AND tenant_id = ?', [
            abono.pedido_id,
            tenantId
        ]);
        if (pedidos.length > 0 && ['cerrado', 'cancelado'].includes(pedidos[0].estado)) {
            throw new Error('No se puede eliminar un abono de un pedido ya cerrado o cancelado');
        }
        await PedidoAbonoRepository.delete(abonoId, tenantId);
        return { message: 'Abono eliminado' };
    }
}

module.exports = AbonoPedidoService;
