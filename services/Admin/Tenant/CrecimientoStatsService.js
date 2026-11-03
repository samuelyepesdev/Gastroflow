const db = require('../../../config/database');
const { SQL_COLOMBIA, hoyColombia, rangoUtcColombia, sumarDias, toFechaDia } = require('../../../utils/dateHelpers');
const cacheService = require('../../Shared/CacheService');

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
     * Panel de rendimiento del superadmin: crecimiento del sistema, ventas y
     * comparación entre restaurantes, para un periodo configurable (7/30/90/180/365 días).
     */
    static async getCrecimientoStats(options = {}) {
        const periodoDias = PERIODOS_VALIDOS.includes(parseInt(options.periodoDias, 10))
            ? parseInt(options.periodoDias, 10)
            : 30;

        const cacheKey = `superadmin_crecimiento_stats_${periodoDias}`;
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

        const [
            [resumenTenants],
            [[periodoRow]],
            [[periodoAntRow]],
            [[nuevosRow]],
            [[nuevosAntRow]],
            [tendenciaRows],
            [porTenantRows],
            [porTenantAntRows],
            [mensualRows]
        ] = await Promise.all([
            db.query(`
                SELECT COUNT(*) AS total, SUM(CASE WHEN activo = 1 THEN 1 ELSE 0 END) AS activos
                FROM tenants
            `),
            db.query(
                `SELECT COALESCE(SUM(total), 0) AS ventas, COUNT(*) AS facturas
                 FROM facturas WHERE evento_aparte = 0 AND fecha BETWEEN ? AND ?`,
                [utcDesde, utcHasta]
            ),
            db.query(
                `SELECT COALESCE(SUM(total), 0) AS ventas, COUNT(*) AS facturas
                 FROM facturas WHERE evento_aparte = 0 AND fecha BETWEEN ? AND ?`,
                [utcDesdeAnt, utcHastaAnt]
            ),
            db.query(`SELECT COUNT(*) AS cantidad FROM tenants WHERE created_at BETWEEN ? AND ?`, [utcDesde, utcHasta]),
            db.query(`SELECT COUNT(*) AS cantidad FROM tenants WHERE created_at BETWEEN ? AND ?`, [
                utcDesdeAnt,
                utcHastaAnt
            ]),
            db.query(
                `SELECT ${SQL_COLOMBIA.dia('fecha')} AS fecha_col,
                        SUM(total) AS ventas, COUNT(*) AS facturas
                 FROM facturas
                 WHERE evento_aparte = 0 AND fecha BETWEEN ? AND ?
                 GROUP BY fecha_col ORDER BY fecha_col ASC`,
                [utcDesde, utcHasta]
            ),
            db.query(
                `SELECT t.id, t.nombre, COALESCE(SUM(f.total), 0) AS ventas, COUNT(f.id) AS facturas
                 FROM tenants t
                 LEFT JOIN facturas f ON f.tenant_id = t.id AND f.evento_aparte = 0 AND f.fecha BETWEEN ? AND ?
                 WHERE t.activo = 1
                 GROUP BY t.id, t.nombre
                 ORDER BY ventas DESC`,
                [utcDesde, utcHasta]
            ),
            db.query(
                `SELECT t.id, COALESCE(SUM(f.total), 0) AS ventas
                 FROM tenants t
                 LEFT JOIN facturas f ON f.tenant_id = t.id AND f.evento_aparte = 0 AND f.fecha BETWEEN ? AND ?
                 WHERE t.activo = 1
                 GROUP BY t.id`,
                [utcDesdeAnt, utcHastaAnt]
            ),
            db.query(
                `SELECT DATE_FORMAT(${SQL_COLOMBIA.aColombia('fecha')}, '%Y-%m') AS ym,
                        SUM(total) AS ventas, COUNT(*) AS facturas
                 FROM facturas
                 WHERE evento_aparte = 0 AND fecha >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 12 MONTH)
                 GROUP BY ym ORDER BY ym ASC`
            )
        ]);

        // --- KPIs del periodo ---
        const ventasPeriodo = parseFloat(periodoRow?.ventas || 0);
        const facturasPeriodo = parseInt(periodoRow?.facturas || 0, 10);
        const ventasPeriodoAnterior = parseFloat(periodoAntRow?.ventas || 0);
        const facturasPeriodoAnterior = parseInt(periodoAntRow?.facturas || 0, 10);
        const restaurantesNuevos = parseInt(nuevosRow?.cantidad || 0, 10);
        const restaurantesNuevosAnterior = parseInt(nuevosAntRow?.cantidad || 0, 10);

        const kpis = {
            totalRestaurantes: parseInt(resumenTenants[0]?.total || 0, 10),
            restaurantesActivos: parseInt(resumenTenants[0]?.activos || 0, 10),
            restaurantesNuevos,
            ventasPeriodo,
            facturasPeriodo,
            ticketPromedio: facturasPeriodo > 0 ? ventasPeriodo / facturasPeriodo : 0,
            crecimientoVentasPct: crecimientoPct(ventasPeriodo, ventasPeriodoAnterior),
            crecimientoRestaurantesPct: crecimientoPct(restaurantesNuevos, restaurantesNuevosAnterior)
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

        // --- Comparación por restaurante (con crecimiento % vs periodo anterior) ---
        const ventasAntPorTenant = new Map(porTenantAntRows.map(r => [r.id, parseFloat(r.ventas || 0)]));
        const porRestaurante = porTenantRows.map(r => {
            const ventas = parseFloat(r.ventas || 0);
            const ventasAnt = ventasAntPorTenant.get(r.id) || 0;
            const facturas = parseInt(r.facturas || 0, 10);
            return {
                id: r.id,
                nombre: r.nombre,
                ventas,
                facturas,
                ticketPromedio: facturas > 0 ? ventas / facturas : 0,
                crecimientoPct: crecimientoPct(ventas, ventasAnt)
            };
        });

        // --- Crecimiento mensual del sistema (últimos 12 meses, rellena meses sin ventas) ---
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
                facturas: { actual: facturasPeriodo, anterior: facturasPeriodoAnterior },
                restaurantesNuevos: { actual: restaurantesNuevos, anterior: restaurantesNuevosAnterior }
            },
            porRestaurante,
            crecimientoMensual
        };

        cacheService.set(cacheKey, stats, 300);
        return stats;
    }
}

module.exports = CrecimientoStatsService;
