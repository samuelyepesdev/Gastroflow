const db = require('../../../config/database');
const InventarioService = require('../InventarioService');
const ComboArmableService = require('../ComboArmableService');
const ComboVentaRepository = require('../../../repositories/Tenant/ComboVentaRepository');
const RealtimeEvents = require('../../Shared/RealtimeEvents');

class AgregarComboService {
    /**
     * Agrega un combo armado a un pedido como UNA línea (producto_id NULL + combo_id).
     * El precio sale del catálogo (precio base + recargos de lo elegido), nunca del cliente.
     * No se fusiona con una línea igual: cada combo armado lleva su propio snapshot.
     */
    static async execute({ tenantId, pedidoId, combo_id, cantidad = 1, selecciones, nota }) {
        const comboId = Number.parseInt(combo_id, 10);
        const cant = Number.parseFloat(cantidad);
        if (!comboId || !(cant > 0)) {
            throw new Error('combo_id y una cantidad mayor a 0 son requeridos');
        }

        const [pedidos] = await db.query(
            "SELECT id, mesa_id FROM pedidos WHERE id = ? AND tenant_id = ? AND estado NOT IN ('cerrado','cancelado')",
            [pedidoId, tenantId]
        );
        if (pedidos.length === 0) {
            throw new Error('Pedido no encontrado');
        }
        const mesaId = pedidos[0].mesa_id;

        const combo = await ComboArmableService.resolverSeleccion(comboId, tenantId, selecciones);
        await AgregarComboService._avisarStockInsuficiente(tenantId, combo.selecciones, cant);

        const connection = await db.getConnection();
        let itemId;
        try {
            await connection.beginTransaction();
            const [result] = await connection.query(
                `INSERT INTO pedido_items (tenant_id, pedido_id, producto_id, combo_id, cantidad, unidad_medida, precio_unitario, subtotal, estado, nota)
                 VALUES (?, ?, NULL, ?, ?, 'UND', ?, ?, 'pendiente', ?)`,
                [
                    tenantId,
                    pedidoId,
                    comboId,
                    cant,
                    combo.precio_final,
                    Math.round(cant * combo.precio_final * 100) / 100,
                    nota || null
                ]
            );
            itemId = result.insertId;
            await ComboVentaRepository.guardarSeleccionesPedidoItem(itemId, combo.selecciones, connection);
            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

        if (mesaId) {
            await db.query("UPDATE mesas SET estado = 'ocupada' WHERE id = ? AND tenant_id = ?", [mesaId, tenantId]);
        }
        RealtimeEvents.emitPedido({ tenantId, pedidoId, mesaId, action: 'items_updated' });

        return { id: itemId, precio_unitario: combo.precio_final };
    }

    /** Igual que un producto suelto: vender sin stock suficiente avisa en el log pero no bloquea la venta. */
    static async _avisarStockInsuficiente(tenantId, selecciones, cantidadCombo) {
        for (const s of selecciones) {
            try {
                const check = await InventarioService.checkStockParaProducto(
                    tenantId,
                    s.producto_id,
                    s.cantidad * cantidadCombo
                );
                if (!check.ok) {
                    const msg = (check.faltantes || [])
                        .map(
                            f =>
                                `${f.insumo_nombre}: requiere ${f.requerido} ${f.unidad_base}, disponible ${f.disponible}`
                        )
                        .join('; ');
                    // eslint-disable-next-line no-console
                    console.warn(`[Inventario] Combo con "${s.producto_nombre}" sin stock suficiente: ${msg}`);
                }
            } catch (error) {
                console.error('Error al verificar stock del combo:', error);
            }
        }
    }
}

module.exports = AgregarComboService;
