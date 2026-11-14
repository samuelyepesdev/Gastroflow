const db = require('../../../config/database');
const { SQL_COLOMBIA, hoyColombia, rangoUtcColombia, toFechaDia } = require('../../../utils/dateHelpers');
const cacheService = require('../../Shared/CacheService');

// Consultas simultáneas máximas de este reporte: el pool tiene 10 conexiones y la caja en vivo comparte
// ese pool, así que se ejecutan por tandas en vez de las ~17 en serie (lento) o todas a la vez (acapara).
const CONSULTAS_EN_PARALELO = 4;

/** Ejecuta las tareas (funciones async) de a `tamano` a la vez y devuelve sus resultados EN ORDEN. */
async function enTandas(tareas, tamano) {
    const resultados = [];
    for (let i = 0; i < tareas.length; i += tamano) {
        resultados.push(...(await Promise.all(tareas.slice(i, i + tamano).map(t => t()))));
    }
    return resultados;
}

function diasDelMes(parts, hasta) {
    const lista = [];
    for (let i = 1; i <= hasta; i++) {
        lista.push(`${parts[0]}-${parts[1]}-${String(i).padStart(2, '0')}`);
    }
    return lista;
}

class TenantStatsService {
    /**
     * Estadísticas para el dashboard del superadministrador.
     * @returns {Promise<Object>} Dashboard statistics object
     */
    static async getDashboardStats() {
        const cacheKey = 'superadmin_dashboard_stats';
        const cached = cacheService.get(cacheKey);
        if (cached) {
            return cached;
        }

        // Rangos de fechas (día Colombia -> UTC)
        const hoy = hoyColombia();
        const parts = hoy.split('-'); // [yyyy, mm, dd]
        const mesInicioStr = `${parts[0]}-${parts[1]}-01`;
        const diaHoy = Number(parts[2]);
        const { utcDesde: utcMesInicio, utcHasta: utcMesFin } = rangoUtcColombia(mesInicioStr, hoy);

        let mesAnteriorY = parseInt(parts[0], 10);
        let mesAnteriorM = parseInt(parts[1], 10) - 1;
        if (mesAnteriorM === 0) {
            mesAnteriorM = 12;
            mesAnteriorY -= 1;
        }
        const mesAnteriorInicioStr = `${mesAnteriorY}-${String(mesAnteriorM).padStart(2, '0')}-01`;
        const diasEnMesAnterior = new Date(mesAnteriorY, mesAnteriorM, 0).getDate();
        const mesAnteriorFinStr = `${mesAnteriorY}-${String(mesAnteriorM).padStart(2, '0')}-${String(diasEnMesAnterior).padStart(2, '0')}`;
        const { utcDesde: utcMesAntInicio, utcHasta: utcMesAntFin } = rangoUtcColombia(
            mesAnteriorInicioStr,
            mesAnteriorFinStr
        );
        const { utcDesde: utcHoyInicio, utcHasta: utcHoyFin } = rangoUtcColombia(hoy);

        // Las consultas son independientes entre sí: se lanzan por tandas (antes ~17 awaits en serie).
        // Los 3 escaneos completos de `facturas` (cantidad, monto total y desglose por forma de pago) son
        // ahora uno solo, y las ventas diarias normales y de eventos del mes salen de la misma consulta.
        const [
            [resumen],
            [porPlan],
            [sinPlanRow],
            [usuariosRow],
            [pagosRows],
            [productosRows],
            [clientesRows],
            [mesasRows],
            [recientesRow],
            [historicoRows],
            [ventasMesRows],
            [ventasDiaAntRows],
            [tenantsActivos],
            [ventasTenantRows],
            [ventasHoyDirectas],
            [topEventosRows]
        ] = await enTandas(
            [
                () =>
                    db.query(`
                        SELECT
                            COUNT(*) AS total,
                            SUM(CASE WHEN t.activo = 1 THEN 1 ELSE 0 END) AS activos,
                            SUM(CASE WHEN t.activo = 0 OR t.activo IS NULL THEN 1 ELSE 0 END) AS inactivos
                        FROM tenants t
                    `),
                () =>
                    db.query(`
                        SELECT p.nombre AS plan_nombre, p.slug AS plan_slug, p.orden, COUNT(t.id) AS cantidad
                        FROM planes p
                        LEFT JOIN tenants t ON t.plan_id = p.id
                        WHERE p.activo = 1
                        GROUP BY p.id, p.nombre, p.slug, p.orden
                        ORDER BY p.orden ASC, p.nombre ASC
                    `),
                () => db.query(`SELECT COUNT(*) AS cantidad FROM tenants WHERE plan_id IS NULL`),
                () => db.query(`SELECT COUNT(*) AS total FROM usuarios WHERE tenant_id IS NOT NULL`),
                // Cantidad, monto y desglose por forma de pago de TODAS las ventas normales: 1 escaneo
                () =>
                    db.query(`
                        SELECT forma_pago, COUNT(*) AS cnt, COALESCE(SUM(total), 0) AS total
                        FROM facturas
                        WHERE evento_aparte = 0
                        GROUP BY forma_pago
                    `),
                () => db.query(`SELECT COUNT(*) AS cnt FROM productos WHERE tenant_id IS NOT NULL`),
                () => db.query(`SELECT COUNT(*) AS cnt FROM clientes WHERE tenant_id IS NOT NULL`),
                () => db.query(`SELECT COUNT(*) AS cnt FROM mesas WHERE tenant_id IS NOT NULL`),
                () =>
                    db.query(`
                        SELECT COUNT(*) AS cantidad FROM tenants
                        WHERE created_at >= DATE_SUB(${SQL_COLOMBIA.hoy}, INTERVAL 30 DAY)
                    `),
                () =>
                    db.query(`
                        SELECT DATE_FORMAT(created_at, '%Y-%m') AS mes, COUNT(*) AS cantidad
                        FROM tenants
                        WHERE created_at >= DATE_SUB(${SQL_COLOMBIA.hoy}, INTERVAL 6 MONTH)
                        GROUP BY mes
                        ORDER BY mes ASC
                    `),
                // Ventas diarias del mes actual: normales (evento_aparte = 0) y de eventos (= 1) en una consulta
                () =>
                    db.query(
                        `
                        SELECT evento_aparte, ${SQL_COLOMBIA.dia('fecha')} AS fecha_colombia, SUM(total) AS total
                        FROM facturas
                        WHERE fecha BETWEEN ? AND ?
                        GROUP BY evento_aparte, fecha_colombia
                        ORDER BY fecha_colombia ASC
                    `,
                        [utcMesInicio, utcMesFin]
                    ),
                () =>
                    db.query(
                        `
                        SELECT ${SQL_COLOMBIA.dia('fecha')} AS fecha_colombia, SUM(total) AS total
                        FROM facturas
                        WHERE evento_aparte = 0 AND fecha BETWEEN ? AND ?
                        GROUP BY fecha_colombia
                        ORDER BY fecha_colombia ASC
                    `,
                        [utcMesAntInicio, utcMesAntFin]
                    ),
                () => db.query('SELECT id, nombre FROM tenants WHERE activo = 1'),
                () =>
                    db.query(
                        `
                        SELECT t.nombre AS tenant_nombre, ${SQL_COLOMBIA.dia('f.fecha')} AS fecha_colombia, SUM(f.total) AS total
                        FROM facturas f
                        JOIN tenants t ON f.tenant_id = t.id
                        WHERE f.evento_aparte = 0 AND f.fecha BETWEEN ? AND ?
                        GROUP BY f.tenant_id, fecha_colombia
                        ORDER BY fecha_colombia ASC
                    `,
                        [utcMesInicio, utcMesFin]
                    ),
                () =>
                    db.query(
                        `
                        SELECT t.nombre AS tenant_nombre, COALESCE(SUM(f.total), 0) AS total, COUNT(f.id) AS facturas
                        FROM tenants t
                        LEFT JOIN facturas f ON f.tenant_id = t.id
                            AND f.evento_aparte = 0
                            AND f.fecha BETWEEN ? AND ?
                        WHERE t.activo = 1
                        GROUP BY t.id, t.nombre
                        ORDER BY total DESC
                    `,
                        [utcHoyInicio, utcHoyFin]
                    ),
                () =>
                    db.query(
                        `
                        SELECT e.nombre, COALESCE(SUM(f.total), 0) AS total
                        FROM facturas f
                        JOIN eventos e ON f.evento_id = e.id
                        WHERE f.evento_aparte = 1 AND f.fecha BETWEEN ? AND ?
                        GROUP BY e.id, e.nombre
                        ORDER BY total DESC
                        LIMIT 5
                    `,
                        [utcMesInicio, utcMesFin]
                    )
            ],
            CONSULTAS_EN_PARALELO
        );

        // --- Planes ---
        const sinPlanCount = parseInt(sinPlanRow[0]?.cantidad || 0, 10);
        const porPlanList = (porPlan || []).map(row => ({
            plan_nombre: row.plan_nombre || 'Sin plan',
            plan_slug: row.plan_slug || '',
            cantidad: parseInt(row.cantidad || 0, 10)
        }));
        if (sinPlanCount > 0) {
            porPlanList.push({ plan_nombre: 'Sin plan', plan_slug: '', cantidad: sinPlanCount });
        }

        // --- Facturas, monto total y desglose por método de pago (una sola consulta agrupada) ---
        let totalFacturas = 0;
        let totalVentasMonto = 0;
        let totalEfectivo = 0;
        let totalTransferencia = 0;
        let totalOtros = 0;
        pagosRows.forEach(row => {
            const fp = String(row.forma_pago || '')
                .toLowerCase()
                .trim();
            const total = parseFloat(row.total || 0);
            totalFacturas += parseInt(row.cnt || 0, 10);
            totalVentasMonto += total;
            if (fp === 'efectivo') {
                totalEfectivo += total;
            } else if (fp === 'transferencia') {
                totalTransferencia += total;
            } else {
                totalOtros += total;
            }
        });

        // --- Ventas diarias del mes actual (normales y de eventos) ---
        const ventasPorFecha = {};
        const ventasEventosPorFecha = {};
        ventasMesRows.forEach(r => {
            const f = toFechaDia(r.fecha_colombia);
            const destino = Number(r.evento_aparte) === 1 ? ventasEventosPorFecha : ventasPorFecha;
            destino[f] = (destino[f] || 0) + parseFloat(r.total || 0);
        });
        const fechasMes = diasDelMes(parts, diaHoy);
        const ventasDiariasMes = fechasMes.map(fecha => ({ fecha, total: ventasPorFecha[fecha] || 0 }));
        const ventasEventosDiariasMes = fechasMes.map(fecha => ({ fecha, total: ventasEventosPorFecha[fecha] || 0 }));

        // --- Ventas diarias del mes anterior ---
        const ventasPorFechaAnt = {};
        ventasDiaAntRows.forEach(r => {
            ventasPorFechaAnt[toFechaDia(r.fecha_colombia)] = parseFloat(r.total || 0);
        });
        const ventasDiariasMesAnterior = [];
        for (let i = 1; i <= diasEnMesAnterior; i++) {
            const fechaStr = `${mesAnteriorY}-${String(mesAnteriorM).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            ventasDiariasMesAnterior.push({ fecha: fechaStr, total: ventasPorFechaAnt[fechaStr] || 0 });
        }

        // --- Ventas diarias por restaurante (mes actual) ---
        const nombresTenants = new Set();
        const ventasPorTenantYFecha = {};
        tenantsActivos.forEach(t => {
            const nombre = t.nombre || 'Desconocido';
            nombresTenants.add(nombre);
            ventasPorTenantYFecha[nombre] = {};
        });
        ventasTenantRows.forEach(r => {
            const f = toFechaDia(r.fecha_colombia);
            const t = r.tenant_nombre || 'Desconocido';
            if (!ventasPorTenantYFecha[t]) {
                ventasPorTenantYFecha[t] = {};
                nombresTenants.add(t);
            }
            ventasPorTenantYFecha[t][f] = parseFloat(r.total || 0);
        });
        const ventasDiariasPorTenant = Array.from(nombresTenants).map(nombre => ({
            nombre,
            data: fechasMes.map(fecha => ({ fecha, total: (ventasPorTenantYFecha[nombre] || {})[fecha] || 0 }))
        }));

        // --- Ventas de hoy ---
        const ventasHoyPorTenant = ventasHoyDirectas.map(r => ({
            nombre: r.tenant_nombre,
            total: parseFloat(r.total || 0),
            facturas: parseInt(r.facturas || 0, 10)
        }));
        const ventasHoyTotalGlobal = ventasHoyPorTenant.reduce((sum, v) => sum + v.total, 0);

        const topEventos = topEventosRows.map(row => ({
            nombre: row.nombre,
            total: parseFloat(row.total || 0)
        }));

        const r = resumen[0] || {};
        const toNum = val =>
            val === undefined || val === null ? 0 : typeof val === 'bigint' ? Number(val) : parseFloat(val) || 0;
        const rowVal = row => (row && typeof row === 'object' ? toNum(Object.values(row)[0]) : 0);

        const stats = {
            totalRestaurantes: parseInt(toNum(r.total ?? r.TOTAL) || 0, 10),
            restaurantesActivos: parseInt(toNum(r.activos ?? r.ACTIVOS) || 0, 10),
            restaurantesInactivos: parseInt(toNum(r.inactivos ?? r.INACTIVOS) || 0, 10),
            porPlan: porPlanList,
            totalUsuarios: parseInt(rowVal(usuariosRow?.[0]) || 0, 10),
            totalFacturas,
            totalVentasMonto,
            totalEfectivo: totalEfectivo,
            totalTransferencia: totalTransferencia,
            totalOtros: totalOtros,
            totalProductos: parseInt(rowVal(productosRows?.[0]) || 0, 10),
            totalClientes: parseInt(rowVal(clientesRows?.[0]) || 0, 10),
            totalMesas: parseInt(rowVal(mesasRows?.[0]) || 0, 10),
            restaurantesUltimos30Dias: parseInt(rowVal(recientesRow?.[0]) || 0, 10),
            historicoRegistro: historicoRows || [],
            ventasDiariasMes,
            ventasEventosDiariasMes,
            ventasDiariasMesAnterior,
            ventasDiariasPorTenant,
            ventasHoyPorTenant,
            ventasHoyTotalGlobal,
            topEventos
        };

        // Guardar en caché por 5 minutos (300 segundos)
        cacheService.set(cacheKey, stats, 300);
        return stats;
    }
}

module.exports = TenantStatsService;
