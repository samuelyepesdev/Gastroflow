/**
 * FacturacionElectronicaConfigRepository - Data access layer for per-tenant
 * electronic invoicing (Factus) configuration.
 * Related to: services/Tenant/FacturacionElectronicaConfigService.js
 */

const db = require('../../config/database');

class FacturacionElectronicaConfigRepository {
    /**
     * @param {number} tenantId
     * @returns {Promise<Object|null>}
     */
    static async findByTenantId(tenantId) {
        const [rows] = await db.query('SELECT * FROM tenant_facturacion_electronica WHERE tenant_id = ?', [tenantId]);
        return rows[0] || null;
    }

    /**
     * Crea o actualiza la configuración del tenant (upsert por tenant_id).
     * @param {number} tenantId
     * @param {Object} data - Columnas a guardar (ya cifradas donde aplique).
     * @returns {Promise<Object>}
     */
    static async upsert(tenantId, data) {
        const existing = await FacturacionElectronicaConfigRepository.findByTenantId(tenantId);
        const columns = Object.keys(data);

        if (!existing) {
            const [result] = await db.query(
                `INSERT INTO tenant_facturacion_electronica (tenant_id, ${columns.join(', ')}) VALUES (?, ${columns
                    .map(() => '?')
                    .join(', ')})`,
                [tenantId, ...columns.map(c => data[c])]
            );
            return { id: result.insertId };
        }

        const setClause = columns.map(c => `${c} = ?`).join(', ');
        await db.query(`UPDATE tenant_facturacion_electronica SET ${setClause} WHERE tenant_id = ?`, [
            ...columns.map(c => data[c]),
            tenantId
        ]);
        return { id: existing.id };
    }

    /**
     * @param {number} tenantId
     * @param {string} estado - 'deshabilitado' | 'pruebas' | 'activo'
     */
    static async updateEstado(tenantId, estado) {
        // Vía upsert (no UPDATE crudo): si el tenant nunca ha guardado
        // configuración, un UPDATE directo no afecta ninguna fila y el cambio
        // de estado se pierde en silencio.
        await FacturacionElectronicaConfigRepository.upsert(tenantId, { estado });
    }

    /**
     * @param {number} tenantId
     * @param {string|null} error
     */
    static async registrarVerificacion(tenantId, error = null) {
        await db.query(
            'UPDATE tenant_facturacion_electronica SET ultima_verificacion = NOW(), ultimo_error = ? WHERE tenant_id = ?',
            [error, tenantId]
        );
    }
}

module.exports = FacturacionElectronicaConfigRepository;
