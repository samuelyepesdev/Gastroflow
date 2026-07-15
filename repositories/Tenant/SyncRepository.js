/**
 * SyncRepository - Acceso a datos para la sincronización desktop <-> producción.
 * Los nombres de tabla usados aquí siempre vienen de listas fijas en SyncService,
 * nunca de input del cliente, por eso es seguro interpolarlos en el SQL.
 */

const db = require('../../config/database');

class SyncRepository {
    static async findAll(table) {
        const [rows] = await db.query(`SELECT * FROM ${table}`);
        return rows;
    }

    static async findChanged(table, since) {
        if (!since) {
            return SyncRepository.findAll(table);
        }
        const [rows] = await db.query(`SELECT * FROM ${table} WHERE updated_at > ?`, [since]);
        return rows;
    }

    static async findAllByTenant(table, tenantId) {
        const [rows] = await db.query(`SELECT * FROM ${table} WHERE tenant_id = ?`, [tenantId]);
        return rows;
    }

    static async findChangedByTenant(table, tenantId, since) {
        if (!since) {
            return SyncRepository.findAllByTenant(table, tenantId);
        }
        const [rows] = await db.query(`SELECT * FROM ${table} WHERE tenant_id = ? AND updated_at > ?`, [
            tenantId,
            since
        ]);
        return rows;
    }

    static async serverNow() {
        const [rows] = await db.query('SELECT NOW() AS now');
        return rows[0].now;
    }

    static async findLoggedOperation(tenantId, clientUuid) {
        const [rows] = await db.query('SELECT * FROM sync_operations_log WHERE tenant_id = ? AND client_uuid = ?', [
            tenantId,
            clientUuid
        ]);
        return rows[0] || null;
    }

    static async logOperation(tenantId, clientUuid, action, status, serverEntityId) {
        await db.query(
            'INSERT INTO sync_operations_log (tenant_id, client_uuid, action, status, server_entity_id) VALUES (?, ?, ?, ?, ?)',
            [tenantId, clientUuid, action, status, serverEntityId ?? null]
        );
    }
}

module.exports = SyncRepository;
