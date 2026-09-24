/**
 * BonoRepository - Acceso a datos de bonos redimibles (saldo prepago o
 * regalado, identificado por código) y su historial de movimientos.
 */
const db = require('../../config/database');

class BonoRepository {
    static async create({
        tenantId,
        codigo,
        origen,
        valorInicial,
        saldoActual,
        clienteId,
        fechaVencimiento,
        nota,
        usuarioCreadorId
    }) {
        const [result] = await db.query(
            `INSERT INTO bonos
                (tenant_id, codigo, origen, valor_inicial, saldo_actual, cliente_id, fecha_vencimiento, nota, usuario_creador_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                tenantId,
                codigo,
                origen,
                valorInicial,
                saldoActual,
                clienteId || null,
                fechaVencimiento || null,
                nota || null,
                usuarioCreadorId || null
            ]
        );
        return result.insertId;
    }

    static async findByCodigo(codigo, tenantId) {
        const [rows] = await db.query('SELECT * FROM bonos WHERE codigo = ? AND tenant_id = ?', [codigo, tenantId]);
        return rows[0] || null;
    }

    /** Igual que findByCodigo pero con FOR UPDATE: usar dentro de la transacción de facturación, justo antes de redimir. */
    static async findByCodigoForUpdate(codigo, tenantId, connection) {
        const [rows] = await connection.query('SELECT * FROM bonos WHERE codigo = ? AND tenant_id = ? FOR UPDATE', [
            codigo,
            tenantId
        ]);
        return rows[0] || null;
    }

    static async findById(id, tenantId) {
        const [rows] = await db.query(
            `SELECT b.*, c.nombre AS cliente_nombre
             FROM bonos b
             LEFT JOIN clientes c ON c.id = b.cliente_id
             WHERE b.id = ? AND b.tenant_id = ?`,
            [id, tenantId]
        );
        return rows[0] || null;
    }

    static async getAll(tenantId, filters = {}) {
        let query = `
            SELECT b.*, c.nombre AS cliente_nombre
            FROM bonos b
            LEFT JOIN clientes c ON c.id = b.cliente_id
            WHERE b.tenant_id = ?
        `;
        const params = [tenantId];

        if (filters.estado) {
            query += ' AND b.estado = ?';
            params.push(filters.estado);
        }
        if (filters.q) {
            query += ' AND (b.codigo LIKE ? OR c.nombre LIKE ?)';
            params.push(`%${filters.q}%`, `%${filters.q}%`);
        }

        query += ' ORDER BY b.created_at DESC';
        const [rows] = await db.query(query, params);
        return rows;
    }

    static async actualizarImagenUrl(id, tenantId, imagenUrl) {
        await db.query('UPDATE bonos SET imagen_url = ? WHERE id = ? AND tenant_id = ?', [imagenUrl, id, tenantId]);
    }

    static async anular(id, tenantId) {
        await db.query(`UPDATE bonos SET estado = 'anulado' WHERE id = ? AND tenant_id = ?`, [id, tenantId]);
    }

    /**
     * Descuenta `monto` del saldo del bono y registra el movimiento de redención,
     * dentro de la misma transacción/connection que crea la factura (atomicidad:
     * si la factura falla, el rollback también deshace esto).
     * @param {number} saldoAnterior - saldo justo antes de esta redención (ya
     *   bloqueado con findByCodigoForUpdate en la misma transacción).
     */
    static async redimir({ bonoId, tenantId, saldoAnterior, monto, facturaId, usuarioId }, connection) {
        const nuevoSaldo = Math.max(0, Math.round((Number(saldoAnterior) - Number(monto)) * 100) / 100);
        const nuevoEstado = nuevoSaldo <= 0 ? 'agotado' : 'activo';

        await connection.query('UPDATE bonos SET saldo_actual = ?, estado = ? WHERE id = ? AND tenant_id = ?', [
            nuevoSaldo,
            nuevoEstado,
            bonoId,
            tenantId
        ]);
        await connection.query(
            `INSERT INTO bono_movimientos (bono_id, tenant_id, factura_id, tipo, monto, usuario_id)
             VALUES (?, ?, ?, 'redencion', ?, ?)`,
            [bonoId, tenantId, facturaId, monto, usuarioId || null]
        );

        return nuevoSaldo;
    }

    static async registrarMovimiento({ bonoId, tenantId, facturaId = null, tipo, monto, usuarioId = null }) {
        await db.query(
            `INSERT INTO bono_movimientos (bono_id, tenant_id, factura_id, tipo, monto, usuario_id)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [bonoId, tenantId, facturaId, tipo, monto, usuarioId]
        );
    }

    /** Redenciones de bono ligadas a una factura puntual (auditoría del detalle de factura). */
    static async findRedencionesByFactura(facturaId, tenantId) {
        const [rows] = await db.query(
            `SELECT m.monto, m.created_at, b.codigo, u.nombre_completo AS usuario_nombre
             FROM bono_movimientos m
             JOIN bonos b ON b.id = m.bono_id
             LEFT JOIN usuarios u ON u.id = m.usuario_id
             WHERE m.factura_id = ? AND m.tenant_id = ? AND m.tipo = 'redencion'
             ORDER BY m.created_at ASC`,
            [facturaId, tenantId]
        );
        return rows;
    }

    static async getMovimientos(bonoId, tenantId) {
        const [rows] = await db.query(
            `SELECT m.*, u.nombre_completo AS usuario_nombre, f.numero AS factura_numero
             FROM bono_movimientos m
             LEFT JOIN usuarios u ON u.id = m.usuario_id
             LEFT JOIN facturas f ON f.id = m.factura_id
             WHERE m.bono_id = ? AND m.tenant_id = ?
             ORDER BY m.created_at ASC`,
            [bonoId, tenantId]
        );
        return rows;
    }

    /** Marca 'vencido' los bonos activos con saldo cuya fecha_vencimiento ya pasó (cron diario, todos los tenants). */
    static async marcarVencidos() {
        const [result] = await db.query(
            `UPDATE bonos SET estado = 'vencido'
             WHERE estado = 'activo' AND saldo_actual > 0
               AND fecha_vencimiento IS NOT NULL AND fecha_vencimiento < CURDATE()`
        );
        return result.affectedRows;
    }
}

module.exports = BonoRepository;
