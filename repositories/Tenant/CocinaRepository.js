/**
 * CocinaRepository - Data access layer for kitchen orders
 * Handles all SQL queries related to kitchen queue and order items
 * Related to: routes/cocina.js, services/CocinaService.js
 */

const db = require('../../config/database');

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
        const [items] = await db.query(`
            SELECT i.*, p.numero AS pedido_numero, p.mesa_id, m.numero AS mesa_numero, pr.nombre AS producto_nombre
            FROM pedido_items i
            JOIN pedidos p ON p.id = i.pedido_id
            JOIN mesas m ON m.id = p.mesa_id
            JOIN productos pr ON pr.id = i.producto_id
            JOIN categorias c ON pr.categoria_id = c.id
            WHERE p.tenant_id = ? 
              AND c.nombre <> 'Cerámicas'
              AND p.estado NOT IN ('cerrado', 'cancelado') 
              AND i.estado IN ('enviado','preparando','listo')
            ORDER BY COALESCE(i.enviado_at, i.created_at) ASC, i.id ASC
        `, [tenantId]);
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
     * Update state for all items of a product (and note) that are in 'enviado' state
     */
    static async updateGroupEstado(tenantId, productoNombre, nota, estado) {
        const timestampField = estado === 'preparando' ? 'preparado_at' : 'listo_at';

        // Si el objetivo es 'listo', podemos actualizar tanto lo que está 'enviado' como 'preparando'.
        // Si el objetivo es 'preparando', solo lo que está 'enviado'.
        const currentStates = estado === 'preparando' ? ['enviado'] : ['enviado', 'preparando'];

        let query = `
            UPDATE pedido_items pi
            INNER JOIN pedidos p ON pi.pedido_id = p.id
            INNER JOIN productos pr ON pi.producto_id = pr.id
            SET pi.estado = ?, pi.${timestampField} = NOW()
            WHERE p.tenant_id = ? 
              AND pr.nombre = ?
              AND pi.estado IN (?)
        `;

        const params = [estado, tenantId, productoNombre, currentStates];

        if (nota && nota !== '') {
            query += " AND pi.nota = ?";
            params.push(nota);
        } else {
            query += " AND (pi.nota IS NULL OR pi.nota = '')";
        }

        const [result] = await db.query(query, params);
        return result;
    }
}

module.exports = CocinaRepository;

