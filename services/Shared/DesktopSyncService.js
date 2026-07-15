/**
 * DesktopSyncService - Cliente de sincronización del prototipo de escritorio
 * contra la API de producción (endpoints /sync/pull y /sync/push, ver
 * SyncService.js en el lado servidor). Inactivo por completo a menos que
 * SYNC_API_URL esté seteado en el entorno (electron/main.js lo pasa solo
 * cuando corre empaquetado); en producción normal nunca se activa.
 *
 * Falta por construir: la pantalla de login que obtiene el token de
 * producción y lo guarda en SYNC_TOKEN_FILE (hoy ese archivo hay que crearlo
 * a mano para probar). Sin ese archivo, isConfigured() es false y el ciclo
 * de sync no intenta red, pero sí sigue encolando en sync_outbox.
 */

const fs = require('fs');
const crypto = require('crypto');
const db = require('../../config/database');
const SyncOutboxRepository = require('../../repositories/Shared/SyncOutboxRepository');
const logger = require('../../utils/logger');

const BASE_BACKOFF_MS = 10000;
const MAX_BACKOFF_MS = 60000;
const HEALTH_TIMEOUT_MS = 4000;
const PUSH_BATCH_SIZE = 50;

let isOnline = false;
let currentBackoffMs = BASE_BACKOFF_MS;
let nextAttemptAt = 0;
let cycleRunning = false;

function getApiUrl() {
    return process.env.SYNC_API_URL || null;
}

function getToken() {
    const tokenFile = process.env.SYNC_TOKEN_FILE;
    if (!tokenFile || !fs.existsSync(tokenFile)) {
        return null;
    }
    try {
        const data = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
        return data.token || null;
    } catch {
        return null;
    }
}

class DesktopSyncService {
    // true si este proceso corre como desktop enlazado a producción (con o
    // sin token todavía). Gatilla si las rutas deben encolar en sync_outbox.
    static isDesktopMode() {
        return !!getApiUrl();
    }

    // true si además hay token: puede intentar red de verdad.
    static isConfigured() {
        return !!(getApiUrl() && getToken());
    }

    static getStatus() {
        return { online: isOnline, apiUrl: getApiUrl(), configured: DesktopSyncService.isConfigured() };
    }

    static async enqueue(action, params) {
        const clientUuid = crypto.randomUUID();
        await SyncOutboxRepository.enqueue(clientUuid, action, params);
    }

    static async checkHealth() {
        const apiUrl = getApiUrl();
        if (!apiUrl) {
            isOnline = false;
            return false;
        }
        try {
            const res = await fetch(`${apiUrl}/api/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
            isOnline = res.ok;
        } catch {
            isOnline = false;
        }
        return isOnline;
    }

    static async pushPending() {
        const apiUrl = getApiUrl();
        const token = getToken();
        if (!apiUrl || !token) {
            return;
        }

        const pending = await SyncOutboxRepository.findPending(PUSH_BATCH_SIZE);
        if (pending.length === 0) {
            return;
        }

        const operations = pending.map(row => ({
            clientUuid: row.client_uuid,
            action: row.action,
            params: JSON.parse(row.params)
        }));

        const res = await fetch(`${apiUrl}/sync/push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(operations),
            signal: AbortSignal.timeout(15000)
        });
        if (!res.ok) {
            throw new Error(`push falló con status ${res.status}`);
        }

        const { results } = await res.json();
        const byUuid = new Map(results.map(r => [r.clientUuid, r]));

        for (const row of pending) {
            const result = byUuid.get(row.client_uuid);
            if (!result) {
                continue;
            }
            if (result.status === 'applied') {
                await SyncOutboxRepository.markSynced(row.id);
            } else if (result.status === 'conflict') {
                await SyncOutboxRepository.markConflict(row.id, result.error || 'conflicto');
            } else {
                await SyncOutboxRepository.markError(row.id, result.error || 'error desconocido');
            }
        }

        await SyncOutboxRepository.setLastPushAt(new Date());
    }

    static async pullFromProduction() {
        const apiUrl = getApiUrl();
        const token = getToken();
        if (!apiUrl || !token) {
            return;
        }

        const meta = await SyncOutboxRepository.getMeta();
        const since = meta?.last_pull_at ? new Date(meta.last_pull_at).toISOString() : '';
        const url = `${apiUrl}/sync/pull${since ? `?since=${encodeURIComponent(since)}` : ''}`;

        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(20000)
        });
        if (!res.ok) {
            throw new Error(`pull falló con status ${res.status}`);
        }

        const data = await res.json();
        for (const table of Object.keys(data)) {
            if (table === 'syncedAt') {
                continue;
            }
            await DesktopSyncService._upsertRows(table, data[table]);
        }

        await SyncOutboxRepository.setLastPullAt(data.syncedAt);
    }

    // Columnas JSON (ej. tenants.config) llegan de mysql2 ya parseadas como
    // objeto JS. mysql2 formatea un parámetro que es un objeto plano como una
    // lista `col = valor` (pensado para `SET ?`), no como el valor opaco que
    // necesitamos aquí — eso corrompe el VALUES(...) de todo el INSERT.
    // Hay que re-serializarlo a string antes de pasarlo como parámetro.
    static _toParam(value) {
        if (value !== null && typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value)) {
            return JSON.stringify(value);
        }
        return value;
    }

    // Upsert genérico por id: las tablas sincronizadas comparten el mismo
    // esquema local/producción (mismas migraciones), así que las columnas que
    // vienen en cada fila son exactamente las columnas reales de la tabla.
    static async _upsertRows(table, rows) {
        if (!Array.isArray(rows) || rows.length === 0) {
            return;
        }
        for (const row of rows) {
            const columns = Object.keys(row);
            const placeholders = columns.map(() => '?').join(', ');
            const updateClause = columns
                .filter(c => c !== 'id')
                .map(c => `${c} = VALUES(${c})`)
                .join(', ');
            await db.query(
                `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})
                 ON DUPLICATE KEY UPDATE ${updateClause}`,
                columns.map(c => DesktopSyncService._toParam(row[c]))
            );
        }
    }

    /**
     * Un ciclo: revisa conectividad, y si hay internet, sube lo pendiente y
     * baja el delta más reciente. Nunca lanza — un fallo de red es esperado
     * (el restaurante puede estar offline horas), no una condición de error
     * del proceso. Backoff exponencial mientras está offline para no
     * insistir cada pocos segundos sabiendo que no hay conexión.
     */
    static async runCycle() {
        if (!DesktopSyncService.isDesktopMode() || cycleRunning) {
            return;
        }
        if (Date.now() < nextAttemptAt) {
            return;
        }

        cycleRunning = true;
        try {
            const online = await DesktopSyncService.checkHealth();
            if (!online) {
                currentBackoffMs = Math.min(currentBackoffMs * 2, MAX_BACKOFF_MS);
                nextAttemptAt = Date.now() + currentBackoffMs;
                return;
            }
            currentBackoffMs = BASE_BACKOFF_MS;

            await DesktopSyncService.pushPending();
            await DesktopSyncService.pullFromProduction();
        } catch (error) {
            logger.error('Error en ciclo de sincronización desktop', { error: error.message });
            currentBackoffMs = Math.min(currentBackoffMs * 2, MAX_BACKOFF_MS);
            nextAttemptAt = Date.now() + currentBackoffMs;
        } finally {
            cycleRunning = false;
        }
    }
}

module.exports = DesktopSyncService;
