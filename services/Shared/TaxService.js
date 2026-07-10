/**
 * TaxService - Cálculo del desglose de impuestos para facturación electrónica (Fase 1 - Factus).
 * Los precios de carta se manejan como "impuesto incluido"; el desglose se calcula hacia atrás.
 */

const db = require('../../config/database');

const TASAS_TRIBUTO = {
    iva_19: 19.0,
    iva_5: 5.0,
    impoconsumo_8: 8.0,
    exento: 0.0,
    excluido: 0.0
};

class TaxService {
    /**
     * Tasa numérica asociada a un código de tributo.
     * @param {string} tributo
     * @returns {number}
     */
    static tasaDeTributo(tributo) {
        return TASAS_TRIBUTO[tributo] !== undefined ? TASAS_TRIBUTO[tributo] : 0;
    }

    /**
     * Tributo y tasa por defecto configurados en el tenant.
     * @param {number} tenantId
     * @param {import('mysql2/promise').PoolConnection|import('mysql2/promise').Pool} [executor] - Conexión de una transacción en curso; por defecto usa el pool.
     * @returns {Promise<{tributo: string, tasa: number}>}
     */
    static async getDefaultTenant(tenantId, executor = db) {
        const [rows] = await executor.query('SELECT tributo_default, tasa_impuesto_default FROM tenants WHERE id = ?', [
            tenantId
        ]);
        if (!rows[0]) {
            return { tributo: 'excluido', tasa: 0 };
        }
        return {
            tributo: rows[0].tributo_default,
            tasa: Number(rows[0].tasa_impuesto_default) || 0
        };
    }

    /**
     * Mapa producto_id -> tasa de impuesto (usa el tributo del producto o el default del tenant).
     * @param {number} tenantId
     * @param {Array<number>} productoIds
     * @param {import('mysql2/promise').PoolConnection|import('mysql2/promise').Pool} [executor] - Conexión de una transacción en curso; por defecto usa el pool.
     * @returns {Promise<Map<number, number>>}
     */
    static async getTasasPorProducto(tenantId, productoIds, executor = db) {
        const tasas = new Map();
        const ids = [...new Set((productoIds || []).filter(id => id))];
        const defaultTenant = await TaxService.getDefaultTenant(tenantId, executor);

        if (ids.length > 0) {
            const [rows] = await executor.query(
                `SELECT id, tributo, tasa_impuesto FROM productos WHERE id IN (?) AND tenant_id = ?`,
                [ids, tenantId]
            );
            for (const row of rows) {
                const tasa =
                    row.tasa_impuesto !== null && row.tasa_impuesto !== undefined
                        ? Number(row.tasa_impuesto)
                        : TaxService.tasaDeTributo(row.tributo || defaultTenant.tributo);
                tasas.set(row.id, tasa);
            }
        }

        return { tasas, defaultTasa: defaultTenant.tasa };
    }

    /**
     * Desglosa una línea de venta cuyo total (cantidad * precio, con descuento ya aplicado)
     * incluye el impuesto. Devuelve base gravable y valor de impuesto redondeados a centavos.
     * @param {number} totalLineaConImpuesto
     * @param {number} tasaImpuesto
     * @returns {{base_gravable: number, valor_impuesto: number, tasa_impuesto: number}}
     */
    static desglosarLinea(totalLineaConImpuesto, tasaImpuesto) {
        const tasa = Number(tasaImpuesto) || 0;
        const total = Number(totalLineaConImpuesto) || 0;
        const baseGravable = Math.round((total / (1 + tasa / 100)) * 100) / 100;
        const valorImpuesto = Math.round((total - baseGravable) * 100) / 100;
        return { base_gravable: baseGravable, valor_impuesto: valorImpuesto, tasa_impuesto: tasa };
    }
}

module.exports = TaxService;
