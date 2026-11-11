const db = require('../../config/database');
const { SQL_COLOMBIA } = require('../../utils/dateHelpers');

/**
 * Consultas de SOLO LECTURA para el asistente del superadmin. Devuelven agregados y campos de sistema:
 * nunca el texto que escriben los usuarios (descripciones de tickets, respuestas, notas).
 */
class AsistenteSistemaRepository {
    /** Conteos globales de restaurantes y usuarios. */
    static async resumenPlataforma() {
        const [[fila]] = await db.query(
            `SELECT COUNT(*) AS total,
                    COALESCE(SUM(activo = 1), 0) AS activos,
                    COALESCE(SUM(activo = 0), 0) AS inactivos,
                    COALESCE(SUM(suspendido_por_pago = 1), 0) AS suspendidos_por_pago,
                    COALESCE(SUM(estado_aprobacion = 'pendiente'), 0) AS pendientes_aprobacion,
                    COALESCE(SUM(tenant_padre_id IS NOT NULL), 0) AS sucursales
             FROM tenants`
        );
        const [[usuarios]] = await db.query('SELECT COUNT(*) AS activos FROM usuarios WHERE activo = 1');
        return { ...fila, usuarios_activos: usuarios.activos };
    }

    /**
     * Ventas normales (sin las de eventos) por restaurante en un rango de días Colombia, de mayor a menor, más el
     * total de ventas de eventos aparte. Incluye restaurantes ya desactivados si vendieron en el rango.
     */
    static async ventasPorRestaurante(desde, hasta) {
        const [restaurantes] = await db.query(
            `SELECT t.id, t.nombre,
                    COALESCE(SUM(f.total), 0) AS total, COUNT(f.id) AS facturas,
                    COALESCE(SUM(f.monto_efectivo), 0) AS efectivo,
                    COALESCE(SUM(f.monto_transferencia), 0) AS transferencia,
                    COALESCE(SUM(f.monto_bono), 0) AS bono
             FROM tenants t
             LEFT JOIN facturas f ON f.tenant_id = t.id AND f.evento_aparte = 0
                 AND f.fecha >= ${SQL_COLOMBIA.desdeDia()} AND f.fecha < ${SQL_COLOMBIA.hastaDia()}
             GROUP BY t.id, t.nombre, t.activo
             HAVING t.activo = 1 OR COUNT(f.id) > 0
             ORDER BY total DESC`,
            [desde, hasta]
        );
        const [[eventos]] = await db.query(
            `SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS facturas FROM facturas
             WHERE evento_aparte = 1 AND fecha >= ${SQL_COLOMBIA.desdeDia()} AND fecha < ${SQL_COLOMBIA.hastaDia()}`,
            [desde, hasta]
        );
        return { restaurantes, eventos };
    }

    /** Ventas de UN restaurante en un rango: totales, eventos aparte y su mejor día. */
    static async ventasDeRestaurante(tenantId, desde, hasta) {
        const rango = `fecha >= ${SQL_COLOMBIA.desdeDia()} AND fecha < ${SQL_COLOMBIA.hastaDia()}`;
        const [[resumen]] = await db.query(
            `SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS facturas,
                    COALESCE(SUM(monto_efectivo), 0) AS efectivo,
                    COALESCE(SUM(monto_transferencia), 0) AS transferencia,
                    COALESCE(SUM(monto_bono), 0) AS bono
             FROM facturas WHERE tenant_id = ? AND evento_aparte = 0 AND ${rango}`,
            [tenantId, desde, hasta]
        );
        const [[eventos]] = await db.query(
            `SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS facturas
             FROM facturas WHERE tenant_id = ? AND evento_aparte = 1 AND ${rango}`,
            [tenantId, desde, hasta]
        );
        const [[mejorDia]] = await db.query(
            `SELECT ${SQL_COLOMBIA.dia('fecha')} AS dia, SUM(total) AS total
             FROM facturas WHERE tenant_id = ? AND evento_aparte = 0 AND ${rango}
             GROUP BY dia ORDER BY total DESC LIMIT 1`,
            [tenantId, desde, hasta]
        );
        return { resumen, eventos, mejorDia: mejorDia || null };
    }

    /** Productos más vendidos (por unidades) en un rango, de un restaurante o de toda la plataforma. */
    static async topProductos({ tenantId = null, desde, hasta, limite = 10 }) {
        const params = [desde, hasta];
        let filtroTenant = '';
        if (tenantId !== null) {
            filtroTenant = 'AND f.tenant_id = ?';
            params.push(tenantId);
        }
        params.push(limite);
        const [filas] = await db.query(
            `SELECT MIN(p.nombre) AS nombre, SUM(df.cantidad) AS unidades, SUM(df.subtotal) AS total
             FROM detalle_factura df
             INNER JOIN facturas f ON f.id = df.factura_id
             INNER JOIN productos p ON p.id = df.producto_id
             WHERE f.evento_aparte = 0
               AND f.fecha >= ${SQL_COLOMBIA.desdeDia()} AND f.fecha < ${SQL_COLOMBIA.hastaDia()}
               ${filtroTenant}
             GROUP BY LOWER(p.nombre)
             ORDER BY unidades DESC, total DESC
             LIMIT ?`,
            params
        );
        return filas;
    }

    /** Restaurantes cuyo nombre contiene el texto (comodines LIKE escapados). */
    static async buscarRestaurantes(texto, limite = 5) {
        const patron = `%${String(texto).replace(/[\\%_]/g, c => `\\${c}`)}%`;
        const [filas] = await db.query(
            `SELECT t.id, t.nombre, t.activo, t.estado_aprobacion, t.tamano, t.suspendido_por_pago,
                    t.intentos_fallidos_pago, t.proximo_cobro, t.tenant_padre_id, t.max_sucursales, t.created_at,
                    p.nombre AS plan,
                    (SELECT COUNT(*) FROM usuarios u WHERE u.tenant_id = t.id AND u.activo = 1) AS usuarios,
                    (SELECT GROUP_CONCAT(a.slug ORDER BY a.slug SEPARATOR ',')
                       FROM tenant_addons ta INNER JOIN addons a ON a.id = ta.addon_id
                      WHERE ta.tenant_id = t.id) AS addons
             FROM tenants t
             LEFT JOIN planes p ON p.id = t.plan_id
             WHERE t.nombre LIKE ?
             ORDER BY t.nombre
             LIMIT ?`,
            [patron, limite]
        );
        return filas;
    }

    /** Tickets de soporte: conteos y los más antiguos abiertos, SIN el texto del ticket. */
    static async soporte() {
        const [porEstado] = await db.query(
            'SELECT estado, tipo, COUNT(*) AS cantidad FROM soporte_tickets GROUP BY estado, tipo'
        );
        const [antiguos] = await db.query(
            `SELECT s.id, s.tipo, s.estado, t.nombre AS restaurante, s.created_at
             FROM soporte_tickets s LEFT JOIN tenants t ON t.id = s.tenant_id
             WHERE s.estado = 'abierto'
             ORDER BY s.created_at ASC
             LIMIT 5`
        );
        return { porEstado, antiguos };
    }

    /** Cola de trabajos: conteos por estado y los últimos errores. */
    static async colaTrabajos() {
        const [porEstado] = await db.query('SELECT estado, COUNT(*) AS cantidad FROM job_queue GROUP BY estado');
        const [errores] = await db.query(
            `SELECT tipo, intentos, error, updated_at FROM job_queue
             WHERE error IS NOT NULL ORDER BY updated_at DESC LIMIT 5`
        );
        return { porEstado, errores };
    }

    /** Planes activos con sus precios y el catálogo de add-ons. */
    static async planesYAddons() {
        const [planes] = await db.query(
            'SELECT nombre, precio_pequeno, precio_mediano, precio_grande FROM planes WHERE activo = 1 ORDER BY orden, id'
        );
        const [addons] = await db.query('SELECT slug, nombre, precio FROM addons WHERE activo = 1 ORDER BY id');
        return { planes, addons };
    }
}

module.exports = AsistenteSistemaRepository;
