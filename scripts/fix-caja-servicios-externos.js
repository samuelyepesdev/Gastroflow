/**
 * fix-caja-servicios-externos.js
 *
 * Repara dos descuadres históricos de caja:
 *
 *  1. SERVICIOS EXTERNOS (ej. domicilio de un tercero): el cobro entró con la
 *     factura y sumó al arqueo, pero ese dinero se le entrega al proveedor.
 *     Corrección: registrar una SALIDA de caja (caja_movimientos) por ese monto.
 *
 *  2. VENTAS SIN DESGLOSE: facturas con total > 0 pero monto_efectivo = 0 y
 *     monto_transferencia = 0 (las ventas del terminal POS nunca guardaban el
 *     desglose). Corrección: rellenar monto_efectivo / monto_transferencia
 *     según forma_pago.
 *
 * Uso:
 *   node scripts/fix-caja-servicios-externos.js               # solo REPORTE (no modifica nada)
 *   node scripts/fix-caja-servicios-externos.js --apply       # aplica correcciones SOLO en sesiones de caja ABIERTAS
 *   node scripts/fix-caja-servicios-externos.js --apply --tenant=3
 *
 * Nunca modifica sesiones de caja ya CERRADAS (no reescribe arqueos históricos):
 * esas se listan en el reporte para revisión manual.
 */
const db = require('../config/database');
const CajaRepository = require('../repositories/Tenant/CajaRepository');

const APPLY = process.argv.includes('--apply');
const tenantArg = process.argv.find(a => a.startsWith('--tenant='));
const TENANT_ID = tenantArg ? Number.parseInt(tenantArg.split('=')[1], 10) : null;

const fmt = n => '$' + Number(n || 0).toLocaleString('es-CO');

async function seccionServiciosExternos() {
    console.log('\n=== 1) Servicios externos cobrados que inflaron la caja ===\n');

    const params = [];
    let filtroTenant = '';
    if (TENANT_ID) {
        filtroTenant = 'AND f.tenant_id = ?';
        params.push(TENANT_ID);
    }

    const [rows] = await db.query(
        `
        SELECT f.id, f.numero, f.tenant_id, f.fecha, f.forma_pago, f.total,
               f.monto_efectivo, f.caja_sesion_id, cs.estado AS sesion_estado, cs.usuario_id AS sesion_usuario_id,
               ext.monto_ext,
               EXISTS(SELECT 1 FROM caja_movimientos cm
                      WHERE cm.tenant_id = f.tenant_id
                        AND cm.referencia_tipo = 'servicio_externo'
                        AND cm.referencia_id = f.id) AS ya_compensada
        FROM facturas f
        JOIN caja_sesiones cs ON cs.id = f.caja_sesion_id
        JOIN (
            SELECT df.factura_id, SUM(df.subtotal) AS monto_ext
            FROM detalle_factura df
            JOIN servicios s ON s.id = df.servicio_id
            WHERE df.es_servicio = 1 AND s.es_externo = 1
            GROUP BY df.factura_id
        ) ext ON ext.factura_id = f.id
        WHERE ext.monto_ext > 0 ${filtroTenant}
        ORDER BY f.tenant_id, f.fecha
        `,
        params
    );

    if (rows.length === 0) {
        console.log('  Sin facturas con servicios externos vinculadas a una sesión de caja.');
        return { detectadas: 0, corregidas: 0, pendientes: 0 };
    }

    let corregidas = 0;
    let pendientes = 0;
    const tabla = [];

    for (const r of rows) {
        const sesionAbierta = r.sesion_estado === 'abierta';
        let accion;

        // La salida es SIEMPRE en efectivo (al domiciliario se le paga de la
        // gaveta), sin importar cómo pagó el cliente la factura.
        if (r.ya_compensada) {
            accion = 'ya compensada';
        } else if (!sesionAbierta) {
            accion = 'sesión CERRADA — revisar manual';
            pendientes++;
        } else if (APPLY) {
            const id = await CajaRepository.registrarSalidaServicioExterno({
                tenantId: r.tenant_id,
                sesionId: r.caja_sesion_id,
                usuarioId: r.sesion_usuario_id,
                facturaId: r.id,
                numeroFactura: r.numero,
                monto: r.monto_ext
            });
            accion = id ? 'CORREGIDA (salida #' + id + ')' : 'sin cambios';
            if (id) corregidas++;
        } else {
            accion = 'se corregiría (--apply)';
            pendientes++;
        }

        tabla.push({
            tenant: r.tenant_id,
            factura: '#' + r.numero,
            fecha: new Date(r.fecha).toLocaleDateString('es-CO'),
            pago: r.forma_pago,
            total: fmt(r.total),
            serv_externo: fmt(r.monto_ext),
            sesion: r.sesion_estado,
            accion
        });
    }

    console.table(tabla);
    return { detectadas: rows.length, corregidas, pendientes };
}

async function seccionVentasSinDesglose() {
    console.log('\n=== 2) Facturas con total > 0 pero sin desglose efectivo/transferencia ===\n');

    const params = [];
    let filtroTenant = '';
    if (TENANT_ID) {
        filtroTenant = 'AND f.tenant_id = ?';
        params.push(TENANT_ID);
    }

    const [rows] = await db.query(
        `
        SELECT f.id, f.numero, f.tenant_id, f.fecha, f.forma_pago, f.total,
               f.caja_sesion_id, cs.estado AS sesion_estado
        FROM facturas f
        JOIN caja_sesiones cs ON cs.id = f.caja_sesion_id
        WHERE f.total > 0
          AND COALESCE(f.monto_efectivo, 0) = 0
          AND COALESCE(f.monto_transferencia, 0) = 0
          ${filtroTenant}
        ORDER BY f.tenant_id, f.fecha
        `,
        params
    );

    if (rows.length === 0) {
        console.log('  Sin facturas sin desglose vinculadas a una sesión de caja.');
        return { detectadas: 0, corregidas: 0, pendientes: 0 };
    }

    let corregidas = 0;
    let pendientes = 0;
    const tabla = [];

    for (const r of rows) {
        const conocido = r.forma_pago === 'efectivo' || r.forma_pago === 'transferencia';
        const sesionAbierta = r.sesion_estado === 'abierta';
        let accion;

        if (!conocido) {
            accion = 'REVISAR MANUAL (pago ' + r.forma_pago + ')';
            pendientes++;
        } else if (!sesionAbierta) {
            accion = 'sesión CERRADA — revisar manual';
            pendientes++;
        } else if (APPLY) {
            const col = r.forma_pago === 'efectivo' ? 'monto_efectivo' : 'monto_transferencia';
            await db.query(`UPDATE facturas SET ${col} = total WHERE id = ?`, [r.id]);
            accion = 'CORREGIDA (' + col + ' = ' + fmt(r.total) + ')';
            corregidas++;
        } else {
            accion = 'se corregiría (--apply)';
            pendientes++;
        }

        tabla.push({
            tenant: r.tenant_id,
            factura: '#' + r.numero,
            fecha: new Date(r.fecha).toLocaleDateString('es-CO'),
            pago: r.forma_pago,
            total: fmt(r.total),
            sesion: r.sesion_estado,
            accion
        });
    }

    console.table(tabla);
    return { detectadas: rows.length, corregidas, pendientes };
}

(async () => {
    console.log(
        APPLY
            ? '⚙️  MODO --apply: se aplicarán correcciones en sesiones ABIERTAS.'
            : '👀 MODO REPORTE (no se modifica nada). Usa --apply para corregir.'
    );
    if (TENANT_ID) console.log('   Filtrado al tenant ' + TENANT_ID);

    // Orden: primero rellenar el desglose, luego compensar servicios externos
    // (la compensación no depende de monto_efectivo, pero deja el reporte coherente).
    const s2 = await seccionVentasSinDesglose();
    const s1 = await seccionServiciosExternos();

    console.log('\n=== Resumen ===');
    console.log(
        `  Servicios externos:  ${s1.detectadas} detectadas, ${s1.corregidas} corregidas, ${s1.pendientes} pendientes/manual`
    );
    console.log(
        `  Ventas sin desglose: ${s2.detectadas} detectadas, ${s2.corregidas} corregidas, ${s2.pendientes} pendientes/manual`
    );
    if (!APPLY && (s1.detectadas || s2.detectadas)) {
        console.log('\n  Volvé a correr con --apply para aplicar las correcciones en sesiones abiertas.');
    }
    process.exit(0);
})().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
