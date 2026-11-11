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
}

module.exports = AsistenteRepository;
