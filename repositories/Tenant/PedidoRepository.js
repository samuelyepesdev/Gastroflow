/**
 * PedidoRepository - Data access layer for orders
 * Handles all SQL queries related to orders and order items
 * Related to: routes/mesas.js, services/PedidoService.js
 */

const db = require('../../config/database');

const PEDIDO_COLUMNS =
    'id, numero, tenant_id, mesa_id, cliente_id, estado, canal, metodo_pago, total, propina, notas, ' +
    'created_at, updated_at, origen, sesion_cliente';

class PedidoRepository {
    /**
     * Find open order by table ID
     * @param {number} mesaId - Table ID
     * @returns {Promise<Object|null>} Order object or null
     */
    static async findOpenByMesaId(mesaId) {
        const [pedidos] = await db.query(
            `SELECT ${PEDIDO_COLUMNS} FROM pedidos WHERE mesa_id = ? AND estado NOT IN ('cerrado','cancelado') ORDER BY id DESC LIMIT 1`,
            [mesaId]
        );
        return pedidos[0] || null;
    }

    /**
     * Find order by ID
     * @param {number} id - Order ID
     * @returns {Promise<Object|null>} Order object or null
     */
    static async findById(id) {
        const [pedidos] = await db.query(`SELECT ${PEDIDO_COLUMNS} FROM pedidos WHERE id = ?`, [id]);
        return pedidos[0] || null;
    }

    /**
     * Create a new order
     * @param {Object} pedidoData - Order data
     * @param {number} pedidoData.mesa_id - Table ID
     * @param {number} pedidoData.cliente_id - Client ID (optional)
     * @param {string} pedidoData.notas - Notes (optional)
     * @returns {Promise<Object>} Created order with insertId
     */
    static async create(pedidoData) {
        const { mesa_id, cliente_id, notas } = pedidoData;
        const [result] = await db.query(
            'INSERT INTO pedidos (mesa_id, cliente_id, estado, total, notas) VALUES (?, ?, ?, ?, ?)',
            [mesa_id, cliente_id || null, 'abierto', 0, notas || null]
        );
        return result;
    }

    /**
     * Update order total
     * @param {number} id - Order ID
     * @param {number} total - New total
     * @returns {Promise<Object>} Update result
     */
    static async updateTotal(id, total) {
        const result = await db.query('UPDATE pedidos SET total = ? WHERE id = ?', [total, id]);
        return result;
    }

    /**
     * Update order state
     * @param {number} id - Order ID
     * @param {string} estado - New state
     * @returns {Promise<Object>} Update result
     */
    static async updateEstado(id, estado) {
        const result = await db.query('UPDATE pedidos SET estado = ? WHERE id = ?', [estado, id]);
        return result;
    }

    /**
     * Move order to another table
     * @param {number} pedidoId - Order ID
     * @param {number} nuevaMesaId - New table ID
     * @returns {Promise<Object>} Update result
     */
    static async moveToMesa(pedidoId, nuevaMesaId) {
        const result = await db.query('UPDATE pedidos SET mesa_id = ? WHERE id = ?', [nuevaMesaId, pedidoId]);
        return result;
    }

    /**
     * Get order items by order ID
     * @param {number} pedidoId - Order ID
     * @returns {Promise<Array>} Array of order items
     */
    static async getItemsByPedidoId(pedidoId) {
        const [items] = await db.query(
            `
            SELECT i.*, p.nombre AS producto_nombre 
            FROM pedido_items i
            JOIN productos p ON p.id = i.producto_id
            WHERE i.pedido_id = ?
            ORDER BY i.created_at ASC
        `,
            [pedidoId]
        );
        return items;
    }

    /**
     * Add item to order
     * @param {number} pedidoId - Order ID
     * @param {Object} itemData - Item data
     * @returns {Promise<Object>} Created item with insertId
     */
    static async addItem(pedidoId, itemData) {
        const { producto_id, cantidad, unidad, precio, subtotal, nota } = itemData;
        const [result] = await db.query(
            'INSERT INTO pedido_items (pedido_id, producto_id, cantidad, unidad_medida, precio_unitario, subtotal, nota, estado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [pedidoId, producto_id, cantidad, unidad || 'UND', precio, subtotal, nota || null, 'pendiente']
        );
        return result;
    }

    /**
     * Remove item from order
     * @param {number} itemId - Item ID
     * @returns {Promise<Object>} Delete result
     */
    static async removeItem(itemId) {
        const result = await db.query('DELETE FROM pedido_items WHERE id = ?', [itemId]);
        return result;
    }

    /**
     * Send items to kitchen (update state to 'enviado')
     * @param {Array<number>} itemIds - Array of item IDs
     * @returns {Promise<Object>} Update result
     */
    static async sendItemsToKitchen(itemIds) {
        const placeholders = itemIds.map(() => '?').join(',');
        const result = await db.query(
            `UPDATE pedido_items SET estado = 'enviado', enviado_at = NOW() WHERE id IN (${placeholders})`,
            itemIds
        );
        return result;
    }

    /**
     * Get order total from items
     * @param {number} pedidoId - Order ID
     * @returns {Promise<number>} Total amount
     */
    static async calculateTotal(pedidoId) {
        const [result] = await db.query(
            'SELECT COALESCE(SUM(subtotal), 0) AS total FROM pedido_items WHERE pedido_id = ?',
            [pedidoId]
        );
        return parseFloat(result[0]?.total || 0);
    }
}

module.exports = PedidoRepository;
