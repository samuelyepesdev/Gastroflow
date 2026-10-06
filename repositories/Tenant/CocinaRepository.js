/**
 * CocinaRepository - Data access layer for kitchen orders
 * Handles all SQL queries related to kitchen queue and order items
 * Related to: routes/cocina.js, services/CocinaService.js
 */

const db = require('../../config/database');
const ComboVentaRepository = require('./ComboVentaRepository');

class CocinaRepository {
    /**
     * Get kitchen queue (items in 'enviado', 'preparando', 'listo' states) for tenant
     * @param {number} tenantId - Tenant ID
     * @returns {Promise<Array>} Array of kitchen items
     */
    /**
     * Cola de cocina: solo ítems de pedidos abiertos (no cerrados ni cancelados).
     * Al facturar, el pedido pasa a 'cerrado' y sus ítems dejan de mostrarse en cocina.
     */
    static async getQueue(tenantId) {
        const [items] = await db.query(
            `
            SELECT i.*, p.numero AS pedido_numero, p.mesa_id, p.origen AS pedido_origen,
                   m.numero AS mesa_numero, m.tipo AS mesa_tipo, m.descripcion AS mesa_descripcion,
                   COALESCE(pr.nombre, cb.nombre) AS producto_nombre,
                   COALESCE(c.estacion_id, cb.estacion_id) AS estacion_id,
                   e.nombre AS estacion_nombre, e.orden AS estacion_orden
            FROM pedido_items i
            JOIN pedidos p ON p.id = i.pedido_id
            JOIN mesas m ON m.id = p.mesa_id
            LEFT JOIN productos pr ON pr.id = i.producto_id
            LEFT JOIN categorias c ON c.id = pr.categoria_id
            LEFT JOIN combos cb ON cb.id = i.combo_id AND cb.tenant_id = p.tenant_id
            LEFT JOIN estaciones e ON e.id = COALESCE(c.estacion_id, cb.estacion_id)
            WHERE p.tenant_id = ?
              AND (pr.id IS NOT NULL OR cb.id IS NOT NULL)
              AND COALESCE(c.nombre, '') <> 'Cerámicas'
              AND p.estado NOT IN ('cerrado', 'cancelado')
              AND i.estado IN ('enviado','preparando','listo')
            ORDER BY COALESCE(i.enviado_at, i.created_at) ASC, i.id ASC
        `,
            [tenantId]
        );

        if (items.length > 0) {
            const itemIds = items.map(i => i.id);
            const [modificadores] = await db.query(
                'SELECT pedido_item_id, grupo_nombre, opcion_nombre FROM pedido_item_modificadores WHERE pedido_item_id IN (?)',
                [itemIds]
            );
            const combosPorItem = await ComboVentaRepository.getSeleccionesPorItems(
                items.filter(i => i.combo_id).map(i => i.id)
            );
            items.forEach(i => {
                i.modificadores = modificadores.filter(m => m.pedido_item_id === i.id);
                if (i.combo_id) {
                    i.combo_selecciones = combosPorItem.get(i.id) || [];
                }
            });
        }

        return items;
    }

    /**
     * Update item state in kitchen (item must belong to tenant)
     * @param {number} id - Item ID
     * @param {number} tenantId - Tenant ID
     * @param {string} estado - New state ('preparando' or 'listo')
     * @returns {Promise<Object>} Update result
     */
    static async updateItemEstado(id, tenantId, estado) {
        const timestampField = estado === 'preparando' ? 'preparado_at' : 'listo_at';
        const [result] = await db.query(
            `UPDATE pedido_items pi
             INNER JOIN pedidos p ON pi.pedido_id = p.id
             SET pi.estado = ?, pi.${timestampField} = NOW()
             WHERE pi.id = ? AND p.tenant_id = ? AND pi.estado IN ('enviado','preparando')`,
            [estado, id, tenantId]
        );
        return result;
    }

    /**
     * Update state for all items of a product (nota + toppings elegidos) that are in 'enviado' state.
     * modificadoresHash distingue variantes del mismo producto+nota con distintos toppings
     * (ej. "Hamburguesa, BBQ" vs "Hamburguesa, sin salsa"), para no marcarlas juntas por error.
     */
    static async updateGroupEstado(tenantId, productoNombre, nota, estado, modificadoresHash) {
        const timestampField = estado === 'preparando' ? 'preparado_at' : 'listo_at';

        // Si el objetivo es 'listo', podemos actualizar tanto lo que está 'enviado' como 'preparando'.
        // Si el objetivo es 'preparando', solo lo que está 'enviado'.
        const currentStates = estado === 'preparando' ? ['enviado'] : ['enviado', 'preparando'];

        let query = `
            UPDATE pedido_items pi
            INNER JOIN pedidos p ON pi.pedido_id = p.id
            LEFT JOIN productos pr ON pi.producto_id = pr.id
            LEFT JOIN combos cb ON pi.combo_id = cb.id
            SET pi.estado = ?, pi.${timestampField} = NOW()
            WHERE p.tenant_id = ?
              AND COALESCE(pr.nombre, cb.nombre) = ?
              AND pi.estado IN (?)
              AND pi.modificadores_hash <=> ?
        `;

        const params = [estado, tenantId, productoNombre, currentStates, modificadoresHash || null];

        if (nota && nota !== '') {
            query += ' AND pi.nota = ?';
            params.push(nota);
        } else {
            query += " AND (pi.nota IS NULL OR pi.nota = '')";
        }

        const [result] = await db.query(query, params);
        return result;
    }

    /**
     * Completa de una sola vez un pedido "de mostrador" (origen='caja', ver POSRepository.
     * enviarPedidoACocina): la venta ya fue facturada al crearlo, así que aquí solo se
     * cierra el pedido y se libera su mesa virtual dedicada para sacarlo de la cola.
     * Restringido a origen='caja' para no poder cerrar por esta vía un pedido de mesa real.
     */
    static async completarPedidoPOS(pedidoId, tenantId) {
        const [pedidos] = await db.query(
            `SELECT id, mesa_id FROM pedidos WHERE id = ? AND tenant_id = ? AND origen = 'caja'`,
            [pedidoId, tenantId]
        );
        if (pedidos.length === 0) {
            return null;
        }
        const pedido = pedidos[0];

        await db.query(`UPDATE pedidos SET estado = 'cerrado' WHERE id = ?`, [pedido.id]);
        await db.query(`UPDATE mesas SET estado = 'libre' WHERE id = ?`, [pedido.mesa_id]);

        return pedido;
    }

    /**
     * Cancela un pedido "de mostrador" (origen='caja') y sus items, y libera su mesa
     * virtual dedicada. Se usa al eliminar una orden guardada del POS que ya se había
     * enviado a cocina (ver POSService.deleteBorrador) — mismo patrón que WhatsAppService
     * usa para cancelaciones de pedidos.
     */
    static async cancelarPedidoPOS(pedidoId, tenantId) {
        const [pedidos] = await db.query(
            `SELECT id, mesa_id FROM pedidos WHERE id = ? AND tenant_id = ? AND origen = 'caja'`,
            [pedidoId, tenantId]
        );
        if (pedidos.length === 0) {
            return null;
        }
        const pedido = pedidos[0];

        await db.query(`UPDATE pedidos SET estado = 'cancelado' WHERE id = ?`, [pedido.id]);
        await db.query(`UPDATE pedido_items SET estado = 'cancelado' WHERE pedido_id = ?`, [pedido.id]);
        await db.query(`UPDATE mesas SET estado = 'libre', descripcion = NULL WHERE id = ?`, [pedido.mesa_id]);

        return pedido;
    }
}

module.exports = CocinaRepository;
