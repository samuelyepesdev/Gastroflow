const TenantService = require('../../../../services/Admin/TenantService');
const db = require('../../../../config/database');
const cacheService = require('../../../../services/Shared/CacheService');
const RealtimeEvents = require('../../../../services/Shared/RealtimeEvents');

class DashboardController {
    // GET /admin/dashboard
    static async index(req, res) {
        try {
            const stats = await TenantService.getDashboardStats();
            res.render('admin/dashboard', {
                user: req.user,
                stats
            });
        } catch (error) {
            console.error('Error al cargar dashboard superadmin:', error);
            res.status(500).render('errors/internal', { error });
        }
    }

    // GET /admin/dashboard/live-stats
    static async getLiveStats(req, res) {
        try {
            const hoyColombia = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

            const [ventasHoyRows] = await db.query(
                `
                SELECT t.nombre AS tenant_nombre, 
                       COALESCE(SUM(f.total), 0) AS total, 
                       COUNT(f.id) AS facturas
                FROM tenants t
                LEFT JOIN facturas f ON f.tenant_id = t.id
                    AND f.evento_id IS NULL
                    -- Rango sobre la columna (usa idx_facturas_tenant_fecha) en vez de
                    -- comparar DATE(CONVERT_TZ(f.fecha...)), que evaluaba la función en
                    -- cada factura de todos los tenants. Mismo resultado: se
                    -- convierten los límites del día Colombia a UTC.
                    AND f.fecha >= CONVERT_TZ(?, '-05:00', '+00:00')
                    AND f.fecha < CONVERT_TZ(DATE_ADD(?, INTERVAL 1 DAY), '-05:00', '+00:00')
                WHERE t.activo = 1
                GROUP BY t.id, t.nombre
                ORDER BY total DESC
            `,
                [hoyColombia, hoyColombia]
            );

            const ventasHoyPorTenant = ventasHoyRows.map(r => ({
                nombre: r.tenant_nombre,
                total: parseFloat(r.total || 0),
                facturas: parseInt(r.facturas || 0, 10)
            }));

            const ventasHoyTotalGlobal = ventasHoyPorTenant.reduce((sum, v) => sum + v.total, 0);

            // Resumen global histórico: recorre toda la tabla facturas, así que se
            // cachea 5 min -- es un total acumulado, no necesita segundo a segundo.
            let factRow = cacheService.get('admin_live_totales_facturas');
            if (!factRow) {
                [[factRow]] = await db.query('SELECT COUNT(*) AS cnt, COALESCE(SUM(total),0) AS monto FROM facturas');
                cacheService.set('admin_live_totales_facturas', factRow, 300);
            }

            res.json({
                ok: true,
                hoyColombia,
                ventasHoyPorTenant,
                ventasHoyTotalGlobal,
                totalFacturas: parseInt(factRow.cnt || 0, 10),
                totalVentasMonto: parseFloat(factRow.monto || 0)
            });
        } catch (error) {
            console.error('Error en live-stats:', error);
            res.status(500).json({ ok: false, error: 'Error al obtener estadísticas en vivo' });
        }
    }

    // GET /admin/dashboard/live-stream (SSE)
    // Avisa al panel del superadmin cada vez que cualquier tenant registra una
    // venta, para que refresque live-stats solo cuando hay algo nuevo (en vez de
    // consultar cada 60 s). No manda datos de ventas, solo el aviso.
    static liveStream(req, res) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        const send = payload => {
            res.write(`data: ${JSON.stringify(payload)}\n\n`);
            if (typeof res.flush === 'function') {
                res.flush();
            }
        };

        const onVenta = () => send({ event: 'ventaRegistrada' });
        RealtimeEvents.on('ventaRegistrada', onVenta);

        const keepAlive = setInterval(() => {
            res.write(': keepalive\n\n');
            if (typeof res.flush === 'function') {
                res.flush();
            }
        }, 30000);

        let cleaned = false;
        const cleanup = () => {
            if (cleaned) {
                return;
            }
            cleaned = true;
            RealtimeEvents.removeListener('ventaRegistrada', onVenta);
            clearInterval(keepAlive);
        };
        req.on('close', cleanup);
        res.on('close', cleanup);

        send({ event: 'connected' });
    }
}

module.exports = DashboardController;
