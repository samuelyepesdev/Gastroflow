/**
 * FinanzasRepository - Gestión de movimientos de caja, gastos e ingresos.
 */

const db = require('../../config/database');

class FinanzasRepository {
    /**
     * Registra un movimiento de dinero (Entrada/Salida)
     */
    static async createMovimiento(tenantId, data) {
        const { 
            sesion_id, 
            usuario_id, 
            tipo, 
            monto, 
            motivo, 
            categoria_gasto, 
            referencia_tipo, 
            referencia_id 
        } = data;

        const [result] = await db.query(
            `INSERT INTO caja_movimientos 
            (tenant_id, sesion_id, usuario_id, tipo, monto, motivo, categoria_gasto, referencia_tipo, referencia_id) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                tenantId, 
                sesion_id || null, 
                usuario_id, 
                tipo, 
                monto, 
                motivo, 
                categoria_gasto || 'General', 
                referencia_tipo || 'manual', 
                referencia_id || null
            ]
        );
        return result.insertId;
    }

    /**
     * Obtiene el resumen de ingresos y egresos por periodo
     */
    static async getResumenPeriodo(tenantId, fechaInicio, fechaFin) {
        const [rows] = await db.query(
            `SELECT 
                tipo,
                SUM(monto) as total,
                COUNT(*) as cantidad
            FROM caja_movimientos
            WHERE tenant_id = ? AND created_at BETWEEN ? AND ?
            GROUP BY tipo`,
            [tenantId, fechaInicio, fechaFin]
        );
        return rows;
    }

    /**
     * Obtiene ingresos/egresos agrupados por categoría
     */
    static async getPorCategoria(tenantId, tipo, fechaInicio, fechaFin) {
        const [rows] = await db.query(
            `SELECT 
                categoria_gasto,
                SUM(monto) as total
            FROM caja_movimientos
            WHERE tenant_id = ? AND tipo = ? AND created_at BETWEEN ? AND ?
            GROUP BY categoria_gasto
            ORDER BY total DESC`,
            [tenantId, tipo, fechaInicio, fechaFin]
        );
        return rows;
    }
}

module.exports = FinanzasRepository;
