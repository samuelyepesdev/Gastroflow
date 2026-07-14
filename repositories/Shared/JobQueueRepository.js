/**
 * JobQueueRepository - Data access layer for the generic `job_queue` table.
 * Mismo patrón que FacturaElectronicaRepository (cola + backoff exponencial),
 * generalizado para cualquier trabajo pesado que no deba bloquear el request
 * (PDF con puppeteer, envío de email). Related to: services/Shared/JobWorkerService.js
 */

const db = require('../../config/database');

class JobQueueRepository {
    /**
     * Encola un trabajo para procesamiento async.
     * @param {string} tipo
     * @param {Object} payload
     * @param {number|null} tenantId
     * @returns {Promise<number>} id del job
     */
    static async encolar(tipo, payload, tenantId = null) {
        const [result] = await db.query(
            `INSERT INTO job_queue (tipo, tenant_id, payload, estado) VALUES (?, ?, ?, 'pendiente')`,
            [tipo, tenantId, JSON.stringify(payload || {})]
        );
        return result.insertId;
    }

    /**
     * @param {number} id
     * @returns {Promise<Object|null>}
     */
    static async findById(id) {
        const [rows] = await db.query('SELECT * FROM job_queue WHERE id = ?', [id]);
        const row = rows[0] || null;
        return row ? JobQueueRepository._parsePayload(row) : null;
    }

    /**
     * Jobs pendientes listos para procesar (respeta backoff).
     * @param {number} limit
     * @returns {Promise<Array>}
     */
    static async findPendientes(limit = 20) {
        const [rows] = await db.query(
            `SELECT * FROM job_queue
             WHERE estado = 'pendiente' AND (proximo_intento IS NULL OR proximo_intento <= NOW())
             ORDER BY created_at ASC
             LIMIT ?`,
            [limit]
        );
        return rows.map(JobQueueRepository._parsePayload);
    }

    static async marcarProcesando(id) {
        await db.query(`UPDATE job_queue SET estado = 'procesando' WHERE id = ?`, [id]);
    }

    /**
     * @param {number} id
     * @param {string|null} resultadoPath - ruta/referencia del resultado (ej. archivo PDF generado)
     */
    static async marcarCompletado(id, resultadoPath = null) {
        await db.query(`UPDATE job_queue SET estado = 'completado', resultado_path = ?, error = NULL WHERE id = ?`, [
            resultadoPath,
            id
        ]);
    }

    /**
     * Registra un fallo. Aplica backoff exponencial (2^intentos minutos, tope 60 min).
     * Tras MAX_INTENTOS pasa a estado 'error' definitivo.
     * @param {number} id
     * @param {string} mensaje
     * @param {number} intentosPrevios
     */
    static async registrarFallo(id, mensaje, intentosPrevios) {
        const MAX_INTENTOS = 5;
        const intentos = intentosPrevios + 1;
        const esDefinitivo = intentos >= MAX_INTENTOS;
        const backoffMin = Math.min(60, 2 ** intentos);

        await db.query(
            `UPDATE job_queue
             SET estado = ?, error = ?, intentos = ?,
                 proximo_intento = ${esDefinitivo ? 'NULL' : 'DATE_ADD(NOW(), INTERVAL ? MINUTE)'}
             WHERE id = ?`,
            esDefinitivo ? ['error', mensaje, intentos, id] : ['pendiente', mensaje, intentos, backoffMin, id]
        );
    }

    static _parsePayload(row) {
        if (row && typeof row.payload === 'string') {
            try {
                row.payload = JSON.parse(row.payload);
            } catch (_) {
                row.payload = {};
            }
        }
        return row;
    }
}

module.exports = JobQueueRepository;
