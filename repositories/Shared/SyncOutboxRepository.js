/**
 * SyncOutboxRepository - Acceso a la cola local de cambios pendientes de subir
 * (sync_outbox) y al cursor de sincronización (sync_meta). Solo tiene efecto
 * real en la BD local del desktop; en producción estas tablas existen (misma
 * migración compartida) pero quedan vacías y sin uso.
 */

const db = require('../../config/database');

class SyncOutboxRepository {
    static async enqueue(clientUuid, action, params) {
        await db.query('INSERT INTO sync_outbox (client_uuid, action, params, status) VALUES (?, ?, ?, "pending")', [
            clientUuid,
            action,
            JSON.stringify(params)
        ]);
    }

    static async findPending(limit) {
        const [rows] = await db.query(
            "SELECT * FROM sync_outbox WHERE status IN ('pending', 'error') ORDER BY created_at ASC LIMIT ?",
            [limit]
        );
        return rows;
    }

    static async markSynced(id) {
        await db.query("UPDATE sync_outbox SET status = 'synced', synced_at = NOW() WHERE id = ?", [id]);
    }

    static async markConflict(id, message) {
        await db.query("UPDATE sync_outbox SET status = 'conflict', last_error = ? WHERE id = ?", [message, id]);
    }

    static async markError(id, message) {
        await db.query(
            "UPDATE sync_outbox SET status = 'error', attempts = attempts + 1, last_error = ? WHERE id = ?",
            [message, id]
        );
    }

    static async getMeta() {
        const [rows] = await db.query('SELECT * FROM sync_meta WHERE id = 1');
        return rows[0] || null;
    }

    static async setLastPullAt(timestamp) {
        await db.query(
            'INSERT INTO sync_meta (id, last_pull_at) VALUES (1, ?) ON DUPLICATE KEY UPDATE last_pull_at = VALUES(last_pull_at)',
            [timestamp]
        );
    }

    static async setLastPushAt(timestamp) {
        await db.query(
            'INSERT INTO sync_meta (id, last_push_at) VALUES (1, ?) ON DUPLICATE KEY UPDATE last_push_at = VALUES(last_push_at)',
            [timestamp]
        );
    }
}

module.exports = SyncOutboxRepository;
