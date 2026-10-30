const db = require('../../config/database');

/**
 * Consultas agregadas (de TODA la plataforma, no de un tenant) para el resumen
 * que consume Safe Hub. Solo lectura. Los rangos de fecha llegan ya en UTC
 * (ver rangoUtcColombia en utils/dateHelpers).
 */
class HubRepository {
    /** Mide la latencia de la base de datos con una consulta trivial. */
    static async pingDb() {
        const inicio = process.hrtime.bigint();
        await db.query('SELECT 1');
        return Number((process.hrtime.bigint() - inicio) / 1000000n);
    }

    /** Restaurantes (tenants independientes) aprobados: total, activos y suspendidos por impago. */
    static async restaurantes() {
        const [rows] = await db.query(
            `SELECT COUNT(*) AS total,
                    COALESCE(SUM(activo = 1), 0) AS activos,
                    COALESCE(SUM(activo = 1 AND suspendido_por_pago = 1), 0) AS suspendidos_por_pago,
                    COALESCE(SUM(activo = 1 AND intentos_fallidos_pago > 0), 0) AS con_cobro_fallido
             FROM tenants
             WHERE tenant_padre_id IS NULL AND estado_aprobacion = 'aprobado'`
        );
        return rows[0];
    }

    /** Usuarios con acceso (sin contar al superadmin, que no pertenece a ningún restaurante). */
    static async usuariosActivos() {
        const [rows] = await db.query(
            `SELECT COUNT(*) AS total FROM usuarios WHERE activo = 1 AND tenant_id IS NOT NULL`
        );
        return rows[0].total;
    }

    /** Ventas del rango: total vendido, número de facturas y restaurantes que vendieron. */
    static async ventas(utcDesde, utcHasta) {
        const [rows] = await db.query(
            `SELECT COALESCE(SUM(total), 0) AS total,
                    COUNT(*) AS facturas,
                    COUNT(DISTINCT tenant_id) AS restaurantes
             FROM facturas
             WHERE fecha BETWEEN ? AND ?`,
            [utcDesde, utcHasta]
        );
        return rows[0];
    }

    /** Cobros de suscripción fallidos en el rango. */
    static async cobrosFallidos(utcDesde, utcHasta) {
        const [rows] = await db.query(
            `SELECT COUNT(*) AS total FROM suscripcion_pagos WHERE estado = 'fallido' AND created_at BETWEEN ? AND ?`,
            [utcDesde, utcHasta]
        );
        return rows[0].total;
    }
}

module.exports = HubRepository;
