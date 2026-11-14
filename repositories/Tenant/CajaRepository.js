const db = require('../../config/database');
const { hoyColombia } = require('../../utils/dateHelpers');

// Los movimientos con referencia_tipo = 'venta' los crea FinanzasService por
// CADA factura (para el módulo de Finanzas). El arqueo de caja NO debe sumarlos
// como "entradas manuales": las ventas ya se cuentan desde la tabla `facturas`
// (monto_efectivo / monto_transferencia / total). Sumarlos aquí las contaría
// dos veces. Los demás movimientos (manuales, compra_inventario, servicio_externo)
// sí son flujo de caja real y se mantienen.
const EXCLUIR_ENTRADAS_VENTA = `(referencia_tipo IS NULL OR referencia_tipo <> 'venta')`;

class CajaRepository {
    /**
     * Obtiene la sesión abierta actual para un tenant
     */
    static async getSesionAbierta(tenantId) {
        const sql = `SELECT * FROM caja_sesiones WHERE tenant_id = ? AND estado = 'abierta' LIMIT 1`;
        const [rows] = await db.query(sql, [tenantId]);
        return rows[0];
    }

    /**
     * true si el tenant ha abierto caja alguna vez (histórico), sin importar
     * el estado actual. Se usa para no avisar "caja cerrada" a tenants que de
     * plano nunca usan el módulo (locales de un solo operador, etc.).
     */
    static async hasHistorial(tenantId) {
        const sql = `SELECT 1 FROM caja_sesiones WHERE tenant_id = ? LIMIT 1`;
        const [rows] = await db.query(sql, [tenantId]);
        return rows.length > 0;
    }

    /**
     * Abre un nuevo turno/sesión de caja
     */
    static async abrirSesion(tenantId, usuarioId, montoEfectivo, montoTransferencia, notas) {
        const montoInicial = (parseFloat(montoEfectivo) || 0) + (parseFloat(montoTransferencia) || 0);
        const sql = `
            INSERT INTO caja_sesiones (tenant_id, usuario_id, monto_inicial_efectivo, monto_inicial_transferencia, monto_inicial, notas, estado, fecha_apertura)
            VALUES (?, ?, ?, ?, ?, ?, 'abierta', CURRENT_TIMESTAMP)
        `;
        const [result] = await db.query(sql, [
            tenantId,
            usuarioId,
            montoEfectivo,
            montoTransferencia,
            montoInicial,
            notas
        ]);
        return result.insertId;
    }

    /**
     * Cierra una sesión de caja calculando totales
     */
    static async cerrarSesion(sesionId, tenantId, montoFinalReal, notas) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            await CajaRepository._cerrarSesionTx(conn, sesionId, tenantId, montoFinalReal, notas);
            await conn.commit();
        } catch (error) {
            await conn.rollback();
            throw error;
        } finally {
            conn.release();
        }
    }

    /**
     * Cuerpo del cierre dentro de la transacción. Bloquea la fila del turno (FOR UPDATE) y exige que siga
     * abierto: dos clics concurrentes ya no cierran dos veces, y una venta que se está registrando (que
     * toma el turno con LOCK IN SHARE MODE) termina antes de calcular el teórico.
     */
    static async _cerrarSesionTx(conn, sesionId, tenantId, montoFinalReal, notas) {
        const [bloqueada] = await conn.query(
            `SELECT id FROM caja_sesiones WHERE id = ? AND tenant_id = ? AND estado = 'abierta' FOR UPDATE`,
            [sesionId, tenantId]
        );
        if (bloqueada.length === 0) {
            throw Object.assign(new Error('El turno de caja no existe o ya está cerrado'), { status: 409 });
        }

        // Calcular el teórico justo antes de cerrar (Efectivo)
        const [ventasEf] = await conn.query(
            `SELECT SUM(monto_efectivo) as total FROM facturas WHERE caja_sesion_id = ?`,
            [sesionId]
        );
        const [entradas] = await conn.query(
            `SELECT SUM(monto) as total FROM caja_movimientos WHERE sesion_id = ? AND tipo = 'entrada' AND metodo_pago = 'efectivo' AND ${EXCLUIR_ENTRADAS_VENTA}`,
            [sesionId]
        );
        const [salidas] = await conn.query(
            `SELECT SUM(monto) as total FROM caja_movimientos WHERE sesion_id = ? AND tipo = 'salida' AND metodo_pago = 'efectivo'`,
            [sesionId]
        );
        // Movimientos por transferencia: no tocan el efectivo físico pero sí el total del turno.
        const [movTransf] = await conn.query(
            `SELECT COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN monto ELSE -monto END), 0) AS neto
             FROM caja_movimientos
             WHERE sesion_id = ? AND metodo_pago = 'transferencia' AND (tipo = 'salida' OR ${EXCLUIR_ENTRADAS_VENTA})`,
            [sesionId]
        );
        const [sesion] = await conn.query(
            `SELECT monto_inicial_efectivo, monto_inicial_transferencia, monto_inicial FROM caja_sesiones WHERE id = ?`,
            [sesionId]
        );

        const baseEf = parseFloat(sesion[0]?.monto_inicial_efectivo || 0);
        const vEf = parseFloat(ventasEf[0]?.total || 0);
        const e = parseFloat(entradas[0]?.total || 0);
        const s = parseFloat(salidas[0]?.total || 0);

        // Teórico solo de efectivo
        const teoricoEf = baseEf + vEf + e - s;
        const diferencia = montoFinalReal - teoricoEf;

        // También guardar el total final de todo (efectivo + transf)
        const [ventasTotales] = await conn.query(`SELECT SUM(total) as total FROM facturas WHERE caja_sesion_id = ?`, [
            sesionId
        ]);
        const vTot = parseFloat(ventasTotales[0]?.total || 0);
        const teoricoTotal =
            parseFloat(sesion[0]?.monto_inicial || 0) + vTot + e - s + parseFloat(movTransf[0]?.neto || 0);

        const sql = `
            UPDATE caja_sesiones 
            SET monto_final_teorico = ?,
                monto_final_real = ?,
                diferencia = ?,
                notas = CONCAT(IFNULL(notas, ''), '\n', ?),
                estado = 'cerrada',
                fecha_cierre = CURRENT_TIMESTAMP
            WHERE id = ? AND tenant_id = ? AND estado = 'abierta'
        `;
        await conn.query(sql, [
            teoricoTotal,
            montoFinalReal + (teoricoTotal - teoricoEf),
            diferencia,
            notas,
            sesionId,
            tenantId
        ]);
    }

    /**
     * Obtiene el historial de sesiones cerradas
     */
    static async getHistorial(tenantId, limit = 50) {
        const sql = `
            SELECT s.*, u.nombre_completo as usuario_nombre
            FROM caja_sesiones s
            JOIN usuarios u ON s.usuario_id = u.id
            WHERE s.tenant_id = ? AND s.estado = 'cerrada'
            ORDER BY s.fecha_cierre DESC
            LIMIT ?
        `;
        const [rows] = await db.query(sql, [tenantId, limit]);
        return rows;
    }

    /**
     * Registra un movimiento manual (Entrada/Salida)
     */
    static async registrarMovimiento(tenantId, sesionId, usuarioId, tipo, monto, motivo, metodoPago = 'efectivo') {
        const sql = `
            INSERT INTO caja_movimientos (tenant_id, sesion_id, usuario_id, tipo, monto, motivo, metodo_pago, fecha_movimiento)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const [result] = await db.query(sql, [
            tenantId,
            sesionId,
            usuarioId,
            tipo,
            monto,
            motivo,
            metodoPago === 'transferencia' ? 'transferencia' : 'efectivo',
            hoyColombia()
        ]);
        return result.insertId;
    }

    /**
     * Registra la SALIDA de caja que compensa el cobro de un servicio externo
     * (ej. domicilio de un tercero): el dinero entra con la factura pero se le
     * entrega al proveedor del servicio, así que no debe quedar en el arqueo.
     *
     * Idempotente: usa (referencia_tipo='servicio_externo', referencia_id=facturaId)
     * como llave lógica y no vuelve a insertar si ya existe.
     *
     * @param {object} [conn] Conexión/transacción opcional (si no, usa el pool).
     * @returns {Promise<number|null>} id del movimiento creado, o null si no aplica / ya existía.
     */
    static async registrarSalidaServicioExterno(
        { tenantId, sesionId, usuarioId, facturaId, monto, numeroFactura },
        conn = db
    ) {
        const montoNum = Math.round((Number.parseFloat(monto) || 0) * 100) / 100;
        if (!sesionId || !usuarioId || montoNum <= 0) {
            return null;
        }

        const [existe] = await conn.query(
            `SELECT id FROM caja_movimientos
             WHERE tenant_id = ? AND referencia_tipo = 'servicio_externo' AND referencia_id = ?
             LIMIT 1`,
            [tenantId, facturaId]
        );
        if (existe.length > 0) {
            return null;
        }

        const [result] = await conn.query(
            `INSERT INTO caja_movimientos
                (tenant_id, sesion_id, usuario_id, tipo, monto, motivo, categoria_gasto, referencia_tipo, referencia_id, fecha_movimiento)
             VALUES (?, ?, ?, 'salida', ?, ?, 'Servicio externo', 'servicio_externo', ?, ?)`,
            [
                tenantId,
                sesionId,
                usuarioId,
                montoNum,
                `Pago servicio externo (ej. domicilio) - Factura #${numeroFactura ?? facturaId}`,
                facturaId,
                hoyColombia()
            ]
        );
        return result.insertId;
    }

    /**
     * Obtiene estadísticas rápidas de la sesión actual
     */
    static async getEstadisticasSesion(sesionId) {
        // Sumar ventas
        const [ventasEfectivo] = await db.query(
            `SELECT SUM(monto_efectivo) as total FROM facturas WHERE caja_sesion_id = ?`,
            [sesionId]
        );
        const [ventasTransferencia] = await db.query(
            `SELECT SUM(monto_transferencia) as total FROM facturas WHERE caja_sesion_id = ?`,
            [sesionId]
        );
        const [ventas] = await db.query(`SELECT SUM(total) as total FROM facturas WHERE caja_sesion_id = ?`, [
            sesionId
        ]);

        // Sumar movimientos manuales (excluye las entradas 'venta' de FinanzasService,
        // que duplicarían las ventas ya contadas desde la tabla facturas).
        // Separados por método: solo los de efectivo mueven la plata física del arqueo;
        // los de transferencia mueven el saldo en bancos.
        const [movs] = await db.query(
            `SELECT tipo, metodo_pago, SUM(monto) AS total
             FROM caja_movimientos
             WHERE sesion_id = ? AND (tipo = 'salida' OR ${EXCLUIR_ENTRADAS_VENTA})
             GROUP BY tipo, metodo_pago`,
            [sesionId]
        );
        const sumMov = (tipo, metodo) =>
            movs
                .filter(m => m.tipo === tipo && m.metodo_pago === metodo)
                .reduce((acc, m) => acc + parseFloat(m.total || 0), 0);

        // Efectivo recibido / cambio entregado (solo informativo, no afecta el
        // arqueo). El cambio = efectivo_recibido - total de cada factura en efectivo.
        const [efectivoFlujo] = await db.query(
            `SELECT
                 COALESCE(SUM(efectivo_recibido), 0) AS recibido,
                 COALESCE(SUM(GREATEST(efectivo_recibido - total, 0)), 0) AS cambio
             FROM facturas
             WHERE caja_sesion_id = ? AND efectivo_recibido IS NOT NULL`,
            [sesionId]
        );

        return {
            ventas_efectivo: parseFloat(ventasEfectivo[0]?.total || 0),
            ventas_transferencia: parseFloat(ventasTransferencia[0]?.total || 0),
            ventas: parseFloat(ventas[0]?.total || 0),
            entradas: sumMov('entrada', 'efectivo'),
            salidas: sumMov('salida', 'efectivo'),
            entradas_transferencia: sumMov('entrada', 'transferencia'),
            salidas_transferencia: sumMov('salida', 'transferencia'),
            efectivo_recibido_total: parseFloat(efectivoFlujo[0]?.recibido || 0),
            cambio_entregado_total: parseFloat(efectivoFlujo[0]?.cambio || 0)
        };
    }
}

module.exports = CajaRepository;
