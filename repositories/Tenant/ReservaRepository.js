/**
 * ReservaRepository - Acceso a datos de reservas y de su configuración por restaurante.
 * `fecha` y `hora_inicio` son hora de pared de Colombia (DATE / TIME): no se convierten desde UTC.
 */
const db = require('../../config/database');

const CAMPOS_CONFIG = [
    'activo',
    'aforo_maximo',
    'duracion_min',
    'intervalo_min',
    'hora_apertura',
    'hora_ultima',
    'anticipacion_min_horas',
    'dias_max_adelanto',
    'max_personas_reserva',
    'auto_confirmar',
    'mensaje_publico'
];

const ESTADOS_OCUPAN = ['pendiente', 'confirmada', 'sentada'];

class ReservaRepository {
    static async getConfig(tenantId, conn = null) {
        const [rows] = await (conn || db).query('SELECT * FROM reserva_config WHERE tenant_id = ?', [tenantId]);
        return rows[0] || null;
    }

    static async getConfigPorToken(token) {
        const [rows] = await db.query(
            `SELECT rc.*, t.nombre AS restaurante
             FROM reserva_config rc
             JOIN tenants t ON t.id = rc.tenant_id
             WHERE rc.token_publico = ? AND rc.activo = 1`,
            [token]
        );
        return rows[0] || null;
    }

    /** Crea la configuración con sus valores por defecto si aún no existe. */
    static async asegurarConfig(tenantId, token) {
        await db.query('INSERT IGNORE INTO reserva_config (tenant_id, token_publico) VALUES (?, ?)', [tenantId, token]);
        return ReservaRepository.getConfig(tenantId);
    }

    static async actualizarConfig(tenantId, datos) {
        await db.query(
            `UPDATE reserva_config SET ${CAMPOS_CONFIG.map(c => `${c} = ?`).join(', ')} WHERE tenant_id = ?`,
            [...CAMPOS_CONFIG.map(c => datos[c]), tenantId]
        );
    }

    static async setToken(tenantId, token) {
        await db.query('UPDATE reserva_config SET token_publico = ? WHERE tenant_id = ?', [token, tenantId]);
    }

    /** Serializa a las reservas del mismo restaurante (mismo criterio que NumeracionRepository). */
    static async bloquearTenant(connection, tenantId) {
        await connection.query('SELECT id FROM tenants WHERE id = ? FOR UPDATE', [tenantId]);
    }

    /** Reservas de un día que ocupan aforo (para calcular disponibilidad). */
    static async findOcupantesDelDia(tenantId, fecha, conn = null) {
        const [rows] = await (conn || db).query(
            `SELECT id, personas, TIME_FORMAT(hora_inicio, '%H:%i') AS hora_inicio, duracion_min
             FROM reservas
             WHERE tenant_id = ? AND fecha = ? AND estado IN (${ESTADOS_OCUPAN.map(() => '?').join(', ')})`,
            [tenantId, fecha, ...ESTADOS_OCUPAN]
        );
        return rows;
    }

    static async create(connection, tenantId, r) {
        const [result] = await connection.query(
            `INSERT INTO reservas
                (tenant_id, nombre, telefono, email, personas, fecha, hora_inicio, duracion_min, estado,
                 mesa_id, notas, ocasion, origen, consentimiento_at, consentimiento_ip)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                tenantId,
                r.nombre,
                r.telefono,
                r.email,
                r.personas,
                r.fecha,
                r.hora_inicio,
                r.duracion_min,
                r.estado,
                r.mesa_id,
                r.notas,
                r.ocasion,
                r.origen,
                r.consentimiento_at,
                r.consentimiento_ip
            ]
        );
        return result.insertId;
    }

    static async findById(id, tenantId) {
        const [rows] = await db.query(
            `SELECT id, nombre, telefono, email, personas, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha,
                    TIME_FORMAT(hora_inicio, '%H:%i') AS hora_inicio, duracion_min, estado, mesa_id,
                    notas, ocasion, origen, created_at
             FROM reservas WHERE id = ? AND tenant_id = ?`,
            [id, tenantId]
        );
        return rows[0] || null;
    }

    /** Reservas de un rango de días (ambos inclusive), con el nombre de la mesa si tiene. */
    static async findPorRango(tenantId, desde, hasta) {
        const [rows] = await db.query(
            `SELECT r.id, r.nombre, r.telefono, r.email, r.personas, DATE_FORMAT(r.fecha, '%Y-%m-%d') AS fecha,
                    TIME_FORMAT(r.hora_inicio, '%H:%i') AS hora_inicio, r.duracion_min, r.estado, r.mesa_id,
                    r.notas, r.ocasion, r.origen, m.numero AS mesa_numero
             FROM reservas r
             LEFT JOIN mesas m ON m.id = r.mesa_id AND m.tenant_id = r.tenant_id
             WHERE r.tenant_id = ? AND r.fecha BETWEEN ? AND ?
             ORDER BY r.fecha, r.hora_inicio, r.id`,
            [tenantId, desde, hasta]
        );
        return rows;
    }

    static async setEstado(id, tenantId, estado) {
        const [result] = await db.query('UPDATE reservas SET estado = ? WHERE id = ? AND tenant_id = ?', [
            estado,
            id,
            tenantId
        ]);
        return result.affectedRows;
    }

    static async setMesa(id, tenantId, mesaId) {
        const [result] = await db.query('UPDATE reservas SET mesa_id = ? WHERE id = ? AND tenant_id = ?', [
            mesaId,
            id,
            tenantId
        ]);
        return result.affectedRows;
    }

    static async mesaExiste(tenantId, mesaId) {
        const [rows] = await db.query('SELECT id FROM mesas WHERE id = ? AND tenant_id = ?', [mesaId, tenantId]);
        return rows.length > 0;
    }
}

module.exports = ReservaRepository;
