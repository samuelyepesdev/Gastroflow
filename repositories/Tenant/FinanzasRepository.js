/**
 * FinanzasRepository - Gestión de movimientos de caja, gastos e ingresos.
 *
 * Fecha de un movimiento: `fecha_movimiento` es el día REAL de la transacción (la fecha de la
 * factura o del pago, que el usuario puede indicar). `created_at` es solo cuándo se guardó el
 * registro. Todos los reportes agrupan y filtran por el primero; las filas anteriores a la
 * migración 120 (NULL) caen al día de `created_at`.
 */

const db = require('../../config/database');
const { SQL_COLOMBIA, hoyColombia, toFechaDia } = require('../../utils/dateHelpers');

/** Día efectivo (Colombia) de un movimiento. */
const FECHA_MOV = `COALESCE(fecha_movimiento, ${SQL_COLOMBIA.dia('created_at')})`;

class FinanzasRepository {
    /**
     * Registra un movimiento de dinero (Entrada/Salida).
     * `fecha_movimiento` ('YYYY-MM-DD', día Colombia) por defecto es hoy.
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
            referencia_id,
            metodo_pago,
            fecha_movimiento
        } = data;

        const [result] = await db.query(
            `INSERT INTO caja_movimientos
            (tenant_id, sesion_id, usuario_id, tipo, monto, motivo, categoria_gasto, referencia_tipo, referencia_id, metodo_pago, fecha_movimiento)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                tenantId,
                sesion_id || null,
                usuario_id,
                tipo,
                monto,
                motivo,
                categoria_gasto || 'General',
                referencia_tipo || 'manual',
                referencia_id || null,
                metodo_pago === 'transferencia' ? 'transferencia' : 'efectivo',
                fecha_movimiento || hoyColombia()
            ]
        );
        return result.insertId;
    }

    /**
     * Obtiene el resumen de ingresos y egresos de un rango de días (Colombia, ambos inclusive).
     * `es_aporte` = 1 marca las entradas manuales de dinero (el dueño inyecta plata a la caja):
     * NO son ventas y no deben contarse como ingreso ni inflar la utilidad.
     */
    static async getResumenPeriodo(tenantId, desdeDia, hastaDia) {
        const [rows] = await db.query(
            `SELECT
                tipo,
                metodo_pago,
                (tipo = 'entrada' AND (referencia_tipo IS NULL OR referencia_tipo = 'manual')) AS es_aporte,
                SUM(monto) as total,
                COUNT(*) as cantidad
            FROM caja_movimientos
            WHERE tenant_id = ? AND ${FECHA_MOV} BETWEEN ? AND ?
            GROUP BY tipo, metodo_pago, es_aporte`,
            [tenantId, desdeDia, hastaDia]
        );
        return rows;
    }

    /**
     * Obtiene ingresos/egresos agrupados por categoría
     */
    static async getPorCategoria(tenantId, tipo, desdeDia, hastaDia) {
        const [rows] = await db.query(
            `SELECT
                categoria_gasto,
                SUM(monto) as total
            FROM caja_movimientos
            WHERE tenant_id = ? AND tipo = ? AND ${FECHA_MOV} BETWEEN ? AND ?
            GROUP BY categoria_gasto
            ORDER BY total DESC`,
            [tenantId, tipo, desdeDia, hastaDia]
        );
        return rows;
    }

    /**
     * Histórico diario de ingresos y egresos por la fecha REAL del movimiento
     * (solo los días con movimientos; el servicio rellena el resto con ceros).
     */
    static async getHistoricoDiario(tenantId, desdeDia, hastaDia) {
        const [rows] = await db.query(
            `SELECT
                ${FECHA_MOV} as fecha,
                SUM(CASE WHEN tipo = 'entrada' AND referencia_tipo IS NOT NULL AND referencia_tipo <> 'manual' THEN monto ELSE 0 END) as ingresos,
                SUM(CASE WHEN tipo = 'salida' THEN monto ELSE 0 END) as egresos
            FROM caja_movimientos
            WHERE tenant_id = ? AND ${FECHA_MOV} BETWEEN ? AND ?
            GROUP BY fecha
            ORDER BY fecha ASC`,
            [tenantId, desdeDia, hastaDia]
        );
        return rows.map(r => ({
            fecha: toFechaDia(r.fecha),
            ingresos: Number.parseFloat(r.ingresos) || 0,
            egresos: Number.parseFloat(r.egresos) || 0
        }));
    }

    /**
     * Libro diario: movimientos del rango ordenados por fecha real (más reciente primero).
     * `fecha` = día real de la transacción; `created_at` = cuándo se registró.
     */
    static async getMovimientosPeriodo(tenantId, desdeDia, hastaDia, limit = 200) {
        const [rows] = await db.query(
            `SELECT *, ${FECHA_MOV} AS fecha
            FROM caja_movimientos
            WHERE tenant_id = ? AND ${FECHA_MOV} BETWEEN ? AND ?
            ORDER BY fecha DESC, created_at DESC, id DESC
            LIMIT ?`,
            [tenantId, desdeDia, hastaDia, limit]
        );
        return rows.map(r => ({ ...r, fecha: toFechaDia(r.fecha) }));
    }

    /** Suma de costos fijos mensuales activos (arriendo, servicios, nómina...), sin prorratear. */
    static async getCostosFijosActivosMensual(tenantId) {
        const [[row]] = await db.query(
            `SELECT COALESCE(SUM(monto_mensual), 0) AS total FROM costos_fijos WHERE tenant_id = ? AND activo = 1`,
            [tenantId]
        );
        return Number.parseFloat(row.total) || 0;
    }

    /**
     * Ingresos por forma de pago dentro del periodo, a partir de `facturas`
     * (no de caja_movimientos: ahí es donde vive el desglose efectivo/transferencia/bono).
     * Excluye sub-facturas de eventos (evento_id) igual que el resto del sistema, para no duplicar.
     */
    static async getDesglosePorFormaPago(tenantId, utcDesde, utcHasta) {
        const [[row]] = await db.query(
            `SELECT
                COALESCE(SUM(monto_efectivo), 0) AS efectivo,
                COALESCE(SUM(monto_transferencia), 0) AS transferencia,
                COALESCE(SUM(monto_bono), 0) AS bono
            FROM facturas
            WHERE tenant_id = ? AND evento_aparte = 0 AND fecha >= ? AND fecha < ?`,
            [tenantId, utcDesde, utcHasta]
        );
        return {
            efectivo: Number.parseFloat(row.efectivo) || 0,
            transferencia: Number.parseFloat(row.transferencia) || 0,
            bono: Number.parseFloat(row.bono) || 0
        };
    }
}

module.exports = FinanzasRepository;
