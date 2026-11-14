/**
 * MesaRepository - Consultas de mesas para alertas.
 * Los métodos heredados de cuando el sistema no era multi-tenant (sin tenant_id) se eliminaron a propósito:
 * cualquier método nuevo DEBE filtrar por tenant_id.
 */

const db = require('../../config/database');

class MesaRepository {
    /**
     * Mesas con un pedido abierto (no cerrado/cancelado) hace más de `horas`
     * horas, sin facturar todavía. Usado por AlertasService.
     * @param {number} tenantId
     * @param {number} horas
     * @returns {Promise<Array>}
     */
    static async findAbiertasHace(tenantId, horas) {
        const [rows] = await db.query(
            `SELECT m.id AS mesa_id, m.numero AS mesa_numero, p.id AS pedido_id, p.created_at,
                    TIMESTAMPDIFF(HOUR, p.created_at, NOW()) AS horas_abierta
             FROM pedidos p
             JOIN mesas m ON m.id = p.mesa_id
             WHERE p.tenant_id = ?
               AND p.estado NOT IN ('cerrado', 'cancelado')
               AND TIMESTAMPDIFF(HOUR, p.created_at, NOW()) > ?
             ORDER BY p.created_at ASC`,
            [tenantId, horas]
        );
        return rows;
    }
}

module.exports = MesaRepository;
