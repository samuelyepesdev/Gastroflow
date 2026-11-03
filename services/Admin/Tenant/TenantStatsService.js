const db = require('../../../config/database');
const { SQL_COLOMBIA, hoyColombia, rangoUtcColombia, toFechaDia } = require('../../../utils/dateHelpers');
const cacheService = require('../../Shared/CacheService');

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

        const [resumen] = await db.query(`
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN t.activo = 1 THEN 1 ELSE 0 END) AS activos,
                SUM(CASE WHEN t.activo = 0 OR t.activo IS NULL THEN 1 ELSE 0 END) AS inactivos
            FROM tenants t
        `);
        const [porPlan] = await db.query(`
            SELECT p.nombre AS plan_nombre, p.slug AS plan_slug, p.orden, COUNT(t.id) AS cantidad
            FROM planes p
            LEFT JOIN tenants t ON t.plan_id = p.id
            WHERE p.activo = 1
            GROUP BY p.id, p.nombre, p.slug, p.orden
            ORDER BY p.orden ASC, p.nombre ASC
        `);
        const [sinPlanRow] = await db.query(`SELECT COUNT(*) AS cantidad FROM tenants WHERE plan_id IS NULL`);
        const sinPlanCount = parseInt(sinPlanRow[0]?.cantidad || 0, 10);
        const porPlanList = (porPlan || []).map(row => ({
            plan_nombre: row.plan_nombre || 'Sin plan',
            plan_slug: row.plan_slug || '',
            cantidad: parseInt(row.cantidad || 0, 10)
        }));
        if (sinPlanCount > 0) {
            porPlanList.push({ plan_nombre: 'Sin plan', plan_slug: '', cantidad: sinPlanCount });
        }
        const [usuariosRow] = await db.query(`
            SELECT COUNT(*) AS total FROM usuarios WHERE tenant_id IS NOT NULL
        `);
        const [facturasRows] = await db.query(`SELECT COUNT(*) AS cnt FROM facturas WHERE evento_aparte = 0`);
        const [ventasMontoRows] = await db.query(
            `SELECT COALESCE(SUM(total), 0) AS total FROM facturas WHERE evento_aparte = 0`
        );

        // Desglose de monto total vendido por método de pago para todos los restaurantes
        const [montoPorFormaPagoRows] = await db.query(`
            SELECT forma_pago, COALESCE(SUM(total), 0) AS total 
            FROM facturas 
            WHERE evento_aparte = 0 
            GROUP BY forma_pago
        `);
        let totalEfectivo = 0;
        let totalTransferencia = 0;
        let totalOtros = 0;
        montoPorFormaPagoRows.forEach(row => {
            const fp = String(row.forma_pago || '')
                .toLowerCase()
                .trim();
            const total = parseFloat(row.total || 0);
            if (fp === 'efectivo') {
                totalEfectivo += total;
            } else if (fp === 'transferencia') {
                totalTransferencia += total;
            } else {
                totalOtros += total;
            }
        });

        const [productosRows] = await db.query(`SELECT COUNT(*) AS cnt FROM productos WHERE tenant_id IS NOT NULL`);
        const [clientesRows] = await db.query(`SELECT COUNT(*) AS cnt FROM clientes WHERE tenant_id IS NOT NULL`);
        const [mesasRows] = await db.query(`SELECT COUNT(*) AS cnt FROM mesas WHERE tenant_id IS NOT NULL`);
        const [recientesRow] = await db.query(`
            SELECT COUNT(*) AS cantidad FROM tenants
            WHERE created_at >= DATE_SUB(${SQL_COLOMBIA.hoy}, INTERVAL 30 DAY)
        `);
        const [historicoRows] = await db.query(`
            SELECT DATE_FORMAT(created_at, '%Y-%m') AS mes, COUNT(*) AS cantidad
            FROM tenants
            WHERE created_at >= DATE_SUB(${SQL_COLOMBIA.hoy}, INTERVAL 6 MONTH)
            GROUP BY mes
            ORDER BY mes ASC
        `);

        // Ventas del mes actuales diarias (día Colombia)
        const hoy = hoyColombia();
        const parts = hoy.split('-'); // [yyyy, mm, dd]
        const mesInicioStr = `${parts[0]}-${parts[1]}-01`;
        const diaHoy = Number(parts[2]);

        // Rango de fechas UTC para el mes actual colombia
        const { utcDesde: utcMesInicio, utcHasta: utcMesFin } = rangoUtcColombia(mesInicioStr, hoy);

        const [ventasDiaRows] = await db.query(
            `
            SELECT ${SQL_COLOMBIA.dia('fecha')} AS fecha_colombia, SUM(total) as total
            FROM facturas
            WHERE evento_aparte = 0 AND fecha BETWEEN ? AND ?
            GROUP BY fecha_colombia
            ORDER BY fecha_colombia ASC
        `,
            [utcMesInicio, utcMesFin]
        );

        const ventasPorFecha = {};
        ventasDiaRows.forEach(r => {
            const f = toFechaDia(r.fecha_colombia);
            ventasPorFecha[f] = parseFloat(r.total || 0);
        });

        const ventasDiariasMes = [];
        for (let i = 1; i <= diaHoy; i++) {
            const fechaStr = `${parts[0]}-${parts[1]}-${String(i).padStart(2, '0')}`;
            ventasDiariasMes.push({
                fecha: fechaStr,
                total: ventasPorFecha[fechaStr] || 0
            });
        }

        const [ventasEventosDiaRows] = await db.query(
            `
            SELECT ${SQL_COLOMBIA.dia('fecha')} AS fecha_colombia, SUM(total) as total
            FROM facturas
            WHERE evento_aparte = 1 AND fecha BETWEEN ? AND ?
            GROUP BY fecha_colombia
            ORDER BY fecha_colombia ASC
        `,
            [utcMesInicio, utcMesFin]
        );

        const ventasEventosPorFecha = {};
        ventasEventosDiaRows.forEach(r => {
            const f = toFechaDia(r.fecha_colombia);
            ventasEventosPorFecha[f] = parseFloat(r.total || 0);
        });

        const ventasEventosDiariasMes = [];
        for (let i = 1; i <= diaHoy; i++) {
            const fechaStr = `${parts[0]}-${parts[1]}-${String(i).padStart(2, '0')}`;
            ventasEventosDiariasMes.push({
                fecha: fechaStr,
                total: ventasEventosPorFecha[fechaStr] || 0
            });
        }

        // Ventas del mes anterior diarias
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

        const [ventasDiaAntRows] = await db.query(
            `
            SELECT ${SQL_COLOMBIA.dia('fecha')} AS fecha_colombia, SUM(total) as total
            FROM facturas
            WHERE evento_aparte = 0 AND fecha BETWEEN ? AND ?
            GROUP BY fecha_colombia
            ORDER BY fecha_colombia ASC
        `,
            [utcMesAntInicio, utcMesAntFin]
        );

        const ventasPorFechaAnt = {};
        ventasDiaAntRows.forEach(r => {
            const f = toFechaDia(r.fecha_colombia);
            ventasPorFechaAnt[f] = parseFloat(r.total || 0);
        });

        const ventasDiariasMesAnterior = [];
        for (let i = 1; i <= diasEnMesAnterior; i++) {
            const fechaStr = `${mesAnteriorY}-${String(mesAnteriorM).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            ventasDiariasMesAnterior.push({
                fecha: fechaStr,
                total: ventasPorFechaAnt[fechaStr] || 0
            });
        }

        // --- Ventas diarias por restaurante (Mes Actual) ---
        const [tenantsActivos] = await db.query('SELECT id, nombre FROM tenants WHERE activo = 1');
        const nombresTenants = new Set();
        const ventasPorTenantYFecha = {};

        tenantsActivos.forEach(t => {
            const nombre = t.nombre || 'Desconocido';
            nombresTenants.add(nombre);
            ventasPorTenantYFecha[nombre] = {};
        });

        const [ventasTenantRows] = await db.query(
            `
            SELECT t.nombre AS tenant_nombre, ${SQL_COLOMBIA.dia('f.fecha')} AS fecha_colombia, SUM(f.total) as total
            FROM facturas f
            JOIN tenants t ON f.tenant_id = t.id
            WHERE f.evento_aparte = 0 AND f.fecha BETWEEN ? AND ?
            GROUP BY f.tenant_id, fecha_colombia
            ORDER BY fecha_colombia ASC
        `,
            [utcMesInicio, utcMesFin]
        );

        ventasTenantRows.forEach(r => {
            const f = toFechaDia(r.fecha_colombia);
            const t = r.tenant_nombre || 'Desconocido';
            if (!ventasPorTenantYFecha[t]) {
                ventasPorTenantYFecha[t] = {};
                nombresTenants.add(t);
            }
            ventasPorTenantYFecha[t][f] = parseFloat(r.total || 0);
        });

        const ventasDiariasPorTenant = [];
        Array.from(nombresTenants).forEach(nombre => {
            const dataPuntos = [];
            for (let i = 1; i <= diaHoy; i++) {
                const fechaStr = `${parts[0]}-${parts[1]}-${String(i).padStart(2, '0')}`;
                const totalDia = (ventasPorTenantYFecha[nombre] && ventasPorTenantYFecha[nombre][fechaStr]) || 0;
                dataPuntos.push({ fecha: fechaStr, total: totalDia });
            }
            ventasDiariasPorTenant.push({ nombre, data: dataPuntos });
        });

        // Ventas de hoy directas
        const { utcDesde: utcHoyInicio, utcHasta: utcHoyFin } = rangoUtcColombia(hoy);
        const [ventasHoyDirectas] = await db.query(
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
        );

        const ventasHoyPorTenant = ventasHoyDirectas.map(r => ({
            nombre: r.tenant_nombre,
            total: parseFloat(r.total || 0),
            facturas: parseInt(r.facturas || 0, 10)
        }));

        const ventasHoyTotalGlobal = ventasHoyPorTenant.reduce((sum, v) => sum + v.total, 0);

        // Obtener eventos del mes actual con sus ventas
        const [topEventosRows] = await db.query(
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
        );

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
            totalFacturas: parseInt(rowVal(facturasRows?.[0]) || 0, 10),
            totalVentasMonto: parseFloat(rowVal(ventasMontoRows?.[0]) || 0),
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
