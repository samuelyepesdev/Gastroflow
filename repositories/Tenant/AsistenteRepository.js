/**
 * AsistenteRepository - Consultas de solo lectura que necesita el asistente Chef.
 * Todo va acotado por tenant_id: el asistente nunca lee filas de otro restaurante.
 */

const db = require('../../config/database');

class AsistenteRepository {
    /**
     * Mesas del tenant con el dato mínimo para resolver lo que dice el usuario.
     * @param {number} tenantId
     * @returns {Promise<Array<{id:number, numero:string, descripcion:string|null, tipo:string, estado:string}>>}
     */
    static async listarMesas(tenantId) {
        const [mesas] = await db.query(
            `SELECT id, numero, descripcion, tipo, estado
             FROM mesas
             WHERE tenant_id = ?
             ORDER BY CAST(numero AS UNSIGNED), numero`,
            [tenantId]
        );
        return mesas;
    }

    /**
     * Pedido vivo (no cerrado ni cancelado) de una mesa del tenant, o null.
     * @param {number} tenantId
     * @param {number} mesaId
     * @returns {Promise<{id:number, mesa_id:number, estado:string}|null>}
     */
    static async pedidoAbiertoDeMesa(tenantId, mesaId) {
        const [rows] = await db.query(
            `SELECT id, mesa_id, estado
             FROM pedidos
             WHERE mesa_id = ? AND tenant_id = ? AND estado NOT IN ('cerrado','cancelado')
             ORDER BY id DESC
             LIMIT 1`,
            [mesaId, tenantId]
        );
        return rows[0] || null;
    }

    /**
     * Item de pedido SOLO si su pedido pertenece al tenant (si no, null).
     * @param {number} tenantId
     * @param {number} itemId
     * @returns {Promise<{id:number, estado:string, pedido_id:number}|null>}
     */
    static async itemDelTenant(tenantId, itemId) {
        const [rows] = await db.query(
            `SELECT pi.id, pi.estado, pi.pedido_id
             FROM pedido_items pi
             INNER JOIN pedidos p ON p.id = pi.pedido_id
             WHERE pi.id = ? AND p.tenant_id = ?`,
            [itemId, tenantId]
        );
        return rows[0] || null;
    }
}

module.exports = AsistenteRepository;
