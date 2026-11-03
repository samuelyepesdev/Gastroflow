const db = require('../../config/database');
const { SQL_COLOMBIA, hoyColombia, rangoUtcColombia, sumarDias, toFechaDia } = require('../../utils/dateHelpers');
const cacheService = require('../Shared/CacheService');

const PERIODOS_VALIDOS = [7, 30, 90, 180, 365];

/**
 * % de crecimiento entre dos periodos. Si no hubo datos en el periodo anterior
 * pero sí en el actual, no hay una tasa real que calcular (división por cero) --
 * se devuelve null para que la vista lo muestre como "Nuevo" en vez de un % engañoso.
 */
function crecimientoPct(actual, anterior) {
    if (anterior > 0) {
        return ((actual - anterior) / anterior) * 100;
    }
    return actual > 0 ? null : 0;
}

class CrecimientoStatsService {
    /**
     * Panel de crecimiento de un tenant individual: ventas del negocio a lo largo
     * del tiempo y comparación contra el periodo anterior, para un periodo
     * configurable (7/30/90/180/365 días). Analogía tenant-scoped del panel de
     * rendimiento del superadmin (services/Admin/Tenant/CrecimientoStatsService.js),
     * sin las secciones de comparación entre restaurantes.
     */
    static async getCrecimientoStats(tenantId, options = {}) {
        const periodoDias = PERIODOS_VALIDOS.includes(parseInt(options.periodoDias, 10))
            ? parseInt(options.periodoDias, 10)
            : 30;

        const cacheKey = `tenant_${tenantId}_crecimiento_stats_${periodoDias}`;
        const cached = cacheService.get(cacheKey);
        if (cached) {
            return cached;
        }

        const hoy = hoyColombia();
        const desde = sumarDias(hoy, -(periodoDias - 1));
        const hasta = hoy;
        const hastaAnterior = sumarDias(desde, -1);
        const desdeAnterior = sumarDias(hastaAnterior, -(periodoDias - 1));

        const { utcDesde, utcHasta } = rangoUtcColombia(desde, hasta);
        const { utcDesde: utcDesdeAnt, utcHasta: utcHastaAnt } = rangoUtcColombia(desdeAnterior, hastaAnterior);

        const [[[periodoRow]], [[periodoAntRow]], [tendenciaRows], [mensualRows]] = await Promise.all([
            db.query(
                `SELECT COALESCE(SUM(total), 0) AS ventas, COUNT(*) AS facturas
                 FROM facturas WHERE tenant_id = ? AND evento_aparte = 0 AND fecha BETWEEN ? AND ?`,
                [tenantId, utcDesde, utcHasta]
            ),
            db.query(
                `SELECT COALESCE(SUM(total), 0) AS ventas, COUNT(*) AS facturas
                 FROM facturas WHERE tenant_id = ? AND evento_aparte = 0 AND fecha BETWEEN ? AND ?`,
                [tenantId, utcDesdeAnt, utcHastaAnt]
            ),
            db.query(
                `SELECT ${SQL_COLOMBIA.dia('fecha')} AS fecha_col,
                        SUM(total) AS ventas, COUNT(*) AS facturas
                 FROM facturas
                 WHERE tenant_id = ? AND evento_aparte = 0 AND fecha BETWEEN ? AND ?
                 GROUP BY fecha_col ORDER BY fecha_col ASC`,
                [tenantId, utcDesde, utcHasta]
            ),
            db.query(
                `SELECT DATE_FORMAT(${SQL_COLOMBIA.aColombia('fecha')}, '%Y-%m') AS ym,
                        SUM(total) AS ventas, COUNT(*) AS facturas
                 FROM facturas
                 WHERE tenant_id = ? AND evento_aparte = 0 AND fecha >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 12 MONTH)
                 GROUP BY ym ORDER BY ym ASC`,
                [tenantId]
            )
        ]);

        // --- KPIs del periodo ---
        const ventasPeriodo = parseFloat(periodoRow?.ventas || 0);
        const facturasPeriodo = parseInt(periodoRow?.facturas || 0, 10);
        const ventasPeriodoAnterior = parseFloat(periodoAntRow?.ventas || 0);
        const facturasPeriodoAnterior = parseInt(periodoAntRow?.facturas || 0, 10);

        const kpis = {
            ventasPeriodo,
            facturasPeriodo,
            ticketPromedio: facturasPeriodo > 0 ? ventasPeriodo / facturasPeriodo : 0,
            crecimientoVentasPct: crecimientoPct(ventasPeriodo, ventasPeriodoAnterior),
            crecimientoFacturasPct: crecimientoPct(facturasPeriodo, facturasPeriodoAnterior)
        };

        // --- Tendencia en el tiempo (rellena días sin ventas con 0) ---
        const ventasPorFecha = {};
        tendenciaRows.forEach(r => {
            ventasPorFecha[toFechaDia(r.fecha_col)] = {
                ventas: parseFloat(r.ventas || 0),
                facturas: parseInt(r.facturas || 0, 10)
            };
        });
        const tendencia = [];
        for (let i = 0; i < periodoDias; i++) {
            const fecha = sumarDias(desde, i);
            const punto = ventasPorFecha[fecha] || { ventas: 0, facturas: 0 };
            tendencia.push({ fecha, ventas: punto.ventas, facturas: punto.facturas });
        }

        // --- Crecimiento mensual del negocio (últimos 12 meses, rellena meses sin ventas) ---
        const ventasPorMesKey = new Map(
            mensualRows.map(r => [r.ym, { ventas: parseFloat(r.ventas || 0), facturas: parseInt(r.facturas || 0, 10) }])
        );
        const crecimientoMensual = [];
        const cursor = new Date();
        cursor.setDate(1);
        cursor.setMonth(cursor.getMonth() - 11);
        for (let i = 0; i < 12; i++) {
            const y = cursor.getFullYear();
            const m = String(cursor.getMonth() + 1).padStart(2, '0');
            const key = `${y}-${m}`;
            const punto = ventasPorMesKey.get(key) || { ventas: 0, facturas: 0 };
            crecimientoMensual.push({
                mes: key,
                nombreMes: cursor.toLocaleString('es-CO', { month: 'short', year: '2-digit' }),
                ventas: punto.ventas,
                facturas: punto.facturas
            });
            cursor.setMonth(cursor.getMonth() + 1);
        }

        const stats = {
            periodoDias,
            desde,
            hasta,
            kpis,
            tendencia,
            comparacionPeriodo: {
                ventas: { actual: ventasPeriodo, anterior: ventasPeriodoAnterior },
                facturas: { actual: facturasPeriodo, anterior: facturasPeriodoAnterior }
            },
            crecimientoMensual
        };

        cacheService.set(cacheKey, stats, 300);
        return stats;
    }
}

module.exports = CrecimientoStatsService;
