const db = require('../../../config/database');
const { SQL_COLOMBIA, hoyColombia, rangoUtcColombia, sumarDias, toFechaDia } = require('../../../utils/dateHelpers');

class SalesStatsRepository {
    static async getTotalSales(tenantId, filters = {}) {
        let query = 'SELECT COALESCE(SUM(total), 0) AS total FROM facturas WHERE tenant_id = ? AND evento_aparte = 0';
        const params = [tenantId];

        if (filters.desde && filters.hasta) {
            const { utcDesde, utcHasta } = rangoUtcColombia(filters.desde, filters.hasta);
            query += ' AND fecha BETWEEN ? AND ?';
            params.push(utcDesde, utcHasta);
        }

        const [result] = await db.query(query, params);
        return parseFloat(result[0]?.total || 0);
    }

    static async getTotalSalesAllTime(tenantId) {
        const query = 'SELECT COALESCE(SUM(total), 0) AS total FROM facturas WHERE tenant_id = ? AND evento_aparte = 0';
        const [result] = await db.query(query, [tenantId]);
        return parseFloat(result[0]?.total || 0);
    }

    /** Total y cantidad histórica de ventas normales en UNA consulta (antes eran dos escaneos iguales). */
    static async getTotalesAllTime(tenantId) {
        const [result] = await db.query(
            'SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS cantidad FROM facturas WHERE tenant_id = ? AND evento_aparte = 0',
            [tenantId]
        );
        return {
            total: parseFloat(result[0]?.total || 0),
            cantidad: parseInt(result[0]?.cantidad || 0)
        };
    }

    /** Primer día (Colombia, 'YYYY-MM-DD') con ventas del tenant, o null si nunca ha vendido. */
    static async getPrimeraFechaVenta(tenantId) {
        const [rows] = await db.query(
            `SELECT ${SQL_COLOMBIA.dia('MIN(fecha)')} AS primera
             FROM facturas WHERE tenant_id = ? AND evento_aparte = 0`,
            [tenantId]
        );
        return toFechaDia(rows[0]?.primera);
    }

    static async getVentasHoy(tenantId) {
        const hoy = hoyColombia();
        const { utcDesde, utcHasta } = rangoUtcColombia(hoy);
        const [rows] = await db.query(
            `SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS cantidad
             FROM facturas WHERE tenant_id = ? AND evento_aparte = 0 AND fecha BETWEEN ? AND ?`,
            [tenantId, utcDesde, utcHasta]
        );
        const r = rows[0] || {};
        return {
            total: parseFloat(r.total || 0),
            cantidad: parseInt(r.cantidad || 0)
        };
    }

    static async getVentasMes(tenantId) {
        const hoy = hoyColombia();
        const parts = hoy.split('-');
        const mesInicioStr = `${parts[0]}-${parts[1]}-01`;
        const { utcDesde } = rangoUtcColombia(mesInicioStr);
        const { utcHasta } = rangoUtcColombia(hoy);

        const [rows] = await db.query(
            `SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS cantidad
             FROM facturas WHERE tenant_id = ? AND evento_aparte = 0 AND fecha BETWEEN ? AND ?`,
            [tenantId, utcDesde, utcHasta]
        );
        const r = rows[0] || {};
        return {
            total: parseFloat(r.total || 0),
            cantidad: parseInt(r.cantidad || 0)
        };
    }

    static async getTotalInvoices(tenantId, filters = {}) {
        let query = 'SELECT COUNT(*) AS total FROM facturas WHERE tenant_id = ? AND evento_aparte = 0';
        const params = [tenantId];

        if (filters.desde && filters.hasta) {
            const { utcDesde, utcHasta } = rangoUtcColombia(filters.desde, filters.hasta);
            query += ' AND fecha BETWEEN ? AND ?';
            params.push(utcDesde, utcHasta);
        }

        const [result] = await db.query(query, params);
        return parseInt(result[0]?.total || 0);
    }

    /**
     * Ventas normales (evento_aparte = 0) de VARIOS restaurantes agrupadas por tenant y mes calendario
     * (Colombia) en UNA consulta. Mismo filtro de rango que getTotalSales/getTotalInvoices (rango UTC de
     * rangoUtcColombia), así los totales coinciden con los de esas funciones.
     * @param {number[]} tenantIds
     * @param {string} desde - 'YYYY-MM-DD' (Colombia)
     * @param {string} hasta - 'YYYY-MM-DD' (Colombia)
     * @returns {Promise<Array<{tenant_id:number, mes:string, total:number, cantidad:number}>>} mes = 'YYYY-MM'
     */
    static async getVentasPorTenantYMes(tenantIds, desde, hasta) {
        const ids = [...new Set((tenantIds || []).map(Number).filter(Number.isFinite))];
        if (ids.length === 0) {
            return [];
        }
        const { utcDesde, utcHasta } = rangoUtcColombia(desde, hasta);
        const [rows] = await db.query(
            `SELECT tenant_id,
                    DATE_FORMAT(${SQL_COLOMBIA.aColombia('fecha')}, '%Y-%m') AS mes,
                    COALESCE(SUM(total), 0) AS total,
                    COUNT(*) AS cantidad
             FROM facturas
             WHERE tenant_id IN (?) AND evento_aparte = 0 AND fecha BETWEEN ? AND ?
             GROUP BY tenant_id, mes`,
            [ids, utcDesde, utcHasta]
        );
        return rows.map(r => ({
            tenant_id: Number(r.tenant_id),
            mes: r.mes,
            total: parseFloat(r.total || 0),
            cantidad: parseInt(r.cantidad || 0)
        }));
    }

    static async getTotalInvoicesAllTime(tenantId) {
        const query = 'SELECT COUNT(*) AS total FROM facturas WHERE tenant_id = ? AND evento_aparte = 0';
        const [result] = await db.query(query, [tenantId]);
        return parseInt(result[0]?.total || 0);
    }

    static async getSalesByPaymentMethod(tenantId, filters = {}) {
        let query = `
            SELECT forma_pago, COUNT(*) AS cantidad, SUM(total) AS total
            FROM facturas
            WHERE tenant_id = ? AND evento_aparte = 0
        `;
        const params = [tenantId];

        if (filters.desde && filters.hasta) {
            const { utcDesde, utcHasta } = rangoUtcColombia(filters.desde, filters.hasta);
            query += ' AND fecha BETWEEN ? AND ?';
            params.push(utcDesde, utcHasta);
        }

        query += ' GROUP BY forma_pago';

        const [result] = await db.query(query, params);
        return result.map(row => ({
            forma_pago: row.forma_pago,
            cantidad: parseInt(row.cantidad),
            total: parseFloat(row.total || 0)
        }));
    }

    static async getTotalsByPaymentMethod(tenantId, filters = {}) {
        let query = `
            SELECT f.forma_pago,
                   COALESCE(SUM(f.total), 0) AS total,
                   COALESCE(SUM(f.monto_efectivo), 0) AS total_monto_efectivo,
                   COALESCE(SUM(f.monto_transferencia), 0) AS total_monto_transferencia,
                   COALESCE(SUM(t_ext.ext_sum), 0) AS total_externos
            FROM facturas f
            LEFT JOIN (
                SELECT df.factura_id, SUM(df.subtotal) AS ext_sum
                FROM detalle_factura df
                JOIN servicios s ON s.id = df.servicio_id AND s.tenant_id = ?
                JOIN facturas fx ON fx.id = df.factura_id AND fx.tenant_id = ? AND fx.evento_aparte = 0__RANGO_FX__
                WHERE df.es_servicio = 1 AND s.es_externo = 1
                GROUP BY df.factura_id
            ) t_ext ON t_ext.factura_id = f.id
            WHERE f.tenant_id = ? AND f.evento_aparte = 0
        `;
        // La subconsulta se acota al tenant y al mismo rango que la consulta externa: antes agrupaba los
        // servicios externos de TODOS los tenants y de TODA la historia en cada llamada (4 por dashboard).
        const params = [tenantId, tenantId, tenantId];
        let rangoFx = '';

        if (filters.desde && filters.hasta) {
            const { utcDesde, utcHasta } = rangoUtcColombia(filters.desde, filters.hasta);
            rangoFx = ' AND fx.fecha BETWEEN ? AND ?';
            params.splice(2, 0, utcDesde, utcHasta); // los del rango de la subconsulta van antes del tenant externo
            query += ' AND f.fecha BETWEEN ? AND ?';
            params.push(utcDesde, utcHasta);
        }
        query = query.replace('__RANGO_FX__', rangoFx);

        query += ' GROUP BY f.forma_pago';

        const [result] = await db.query(query, params);

        const totals = {
            efectivo: 0,
            transferencia: 0,
            serviciosExternos: 0
        };

        result.forEach(row => {
            const fp = String(row.forma_pago || '')
                .toLowerCase()
                .trim();
            const totalFactura = parseFloat(row.total || 0);
            const totalExternos = parseFloat(row.total_externos || 0);
            const netSale = totalFactura - totalExternos;

            if (fp === 'efectivo') {
                totals.efectivo += netSale;
            } else if (fp === 'transferencia') {
                totals.transferencia += netSale;
            } else if (fp === 'mixto') {
                // 'mixto' no cae en ninguno de los dos casos de arriba (no es
                // puramente efectivo ni transferencia), así que sin esta rama
                // esas facturas quedaban totalmente fuera de ambos totales.
                // monto_efectivo/monto_transferencia ya vienen desglosados por
                // FacturarPedidoService (líneas pagadas por producto + abonos +
                // lo cobrado al cerrar la mesa), así que se usan directo. No se
                // les resta la porción de servicios externos como al resto
                // (no hay forma de saber de qué lado del mixto salió ese
                // servicio) -- caso raro (externos + pago mixto el mismo día).
                totals.efectivo += parseFloat(row.total_monto_efectivo || 0);
                totals.transferencia += parseFloat(row.total_monto_transferencia || 0);
            }

            totals.serviciosExternos += totalExternos;
        });

        return totals;
    }

    static async getDailySales(tenantId, days = 30) {
        // Días Colombia completos: desde el inicio (UTC) del primer día de la serie.
        // Antes era "ahora - N días" en UTC, que dejaba el primer día cortado.
        const hoy = hoyColombia();
        const primerDia = sumarDias(hoy, -days);
        const { utcDesde } = rangoUtcColombia(primerDia);

        const query = `
            SELECT 
                ${SQL_COLOMBIA.dia('fecha')} AS fecha,
                COUNT(*) AS cantidad_facturas,
                SUM(total) AS total_ventas
            FROM facturas
            WHERE tenant_id = ? AND evento_aparte = 0
              AND fecha >= ?
            GROUP BY ${SQL_COLOMBIA.dia('fecha')}
            ORDER BY fecha ASC
        `;
        const [result] = await db.query(query, [tenantId, utcDesde]);

        const salesMap = new Map();
        result.forEach(row => {
            salesMap.set(toFechaDia(row.fecha), {
                cantidad_facturas: parseInt(row.cantidad_facturas || 0),
                total_ventas: parseFloat(row.total_ventas || 0)
            });
        });

        const list = [];
        for (let i = days; i >= 0; i--) {
            const dateStr = sumarDias(hoy, -i);

            if (salesMap.has(dateStr)) {
                list.push({
                    fecha: dateStr,
                    ...salesMap.get(dateStr)
                });
            } else {
                list.push({
                    fecha: dateStr,
                    cantidad_facturas: 0,
                    total_ventas: 0
                });
            }
        }
        return list;
    }

    /**
     * Ventas por día Colombia entre dos fechas (YYYY-MM-DD, inclusivas), con los
     * días sin ventas en cero para que la serie cubra todo el rango.
     */
    static async getDailySalesRange(tenantId, desde, hasta) {
        const { utcDesde, utcHasta } = rangoUtcColombia(desde, hasta);
        const [result] = await db.query(
            `SELECT ${SQL_COLOMBIA.dia('fecha')} AS fecha,
                    COUNT(*) AS cantidad_facturas,
                    SUM(total) AS total_ventas
             FROM facturas
             WHERE tenant_id = ? AND evento_aparte = 0 AND fecha BETWEEN ? AND ?
             GROUP BY ${SQL_COLOMBIA.dia('fecha')}`,
            [tenantId, utcDesde, utcHasta]
        );

        const salesMap = new Map(result.map(row => [toFechaDia(row.fecha), row]));
        const list = [];
        for (let dia = desde; dia <= hasta; dia = sumarDias(dia, 1)) {
            const row = salesMap.get(dia);
            list.push({
                fecha: dia,
                cantidad_facturas: parseInt(row?.cantidad_facturas || 0),
                total_ventas: parseFloat(row?.total_ventas || 0)
            });
        }
        return list;
    }

    static async getMonthlySales(tenantId, months = 3, options = {}) {
        let query = `
            SELECT 
                YEAR(${SQL_COLOMBIA.aColombia('f.fecha')}) AS year,
                MONTH(${SQL_COLOMBIA.aColombia('f.fecha')}) AS month,
                COUNT(*) AS cantidad_facturas,
                COALESCE(SUM(f.total), 0) AS total_ventas
            FROM facturas f
            WHERE f.tenant_id = ?
              AND f.fecha >= ${SQL_COLOMBIA.aUtc(`DATE_FORMAT(DATE_SUB(${SQL_COLOMBIA.hoy}, INTERVAL ? MONTH), '%Y-%m-01')`)}
        `;
        if (options.excludeEventos) {
            query += ` AND f.evento_aparte = 0`;
        }
        query += `
            GROUP BY year, month
            ORDER BY year ASC, month ASC
        `;
        const [result] = await db.query(query, [tenantId, months]);
        return result.map(row => ({
            year: row.year,
            month: row.month,
            cantidad_facturas: parseInt(row.cantidad_facturas || 0),
            total_ventas: parseFloat(row.total_ventas || 0)
        }));
    }
}

module.exports = SalesStatsRepository;
