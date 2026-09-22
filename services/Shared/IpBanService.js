const db = require('../../config/database');
const cacheService = require('./CacheService');
const logger = require('../../utils/logger');

// Duración del baneo persistido. Larga a propósito (sobrevive redeploys de
// Railway) pero no infinita: una IP dinámica/compartida puede terminar en
// manos de otra persona más adelante.
const BAN_DURATION_DAYS = 30;

function cacheKey(ip) {
    return `scanner_ban_${ip}`;
}

class IpBanService {
    /**
     * Recarga a memoria (CacheService, que consulta el middleware en cada
     * request) los baneos que todavía no expiraron. Se llama una vez al
     * arrancar el proceso para que el bloqueo siga vigente inmediatamente
     * tras un redeploy, sin esperar a que cada IP vuelva a disparar el umbral.
     */
    static async loadActiveBans() {
        try {
            const [rows] = await db.query('SELECT ip, expires_at FROM ip_bans WHERE expires_at > NOW()');
            const now = Date.now();
            rows.forEach(row => {
                const ttlSeconds = Math.max(1, Math.floor((new Date(row.expires_at).getTime() - now) / 1000));
                cacheService.set(cacheKey(row.ip), true, ttlSeconds);
            });
            if (rows.length > 0) {
                logger.info(`IpBanService: ${rows.length} baneo(s) activo(s) recargados en memoria`);
            }
        } catch (error) {
            logger.error('Error cargando baneos de IP', { error: error.message });
        }
    }

    /**
     * Banea una IP por BAN_DURATION_DAYS días: persiste en BD (upsert por IP)
     * y refresca la caché en memoria, que es la que consulta el middleware en
     * caliente en cada request (evita una consulta a BD por petición).
     */
    static async banIp(ip, { reason, hits } = {}) {
        cacheService.set(cacheKey(ip), true, BAN_DURATION_DAYS * 24 * 60 * 60);
        try {
            await db.query(
                `INSERT INTO ip_bans (ip, reason, hits, expires_at)
                 VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))
                 ON DUPLICATE KEY UPDATE reason = VALUES(reason), hits = VALUES(hits),
                     banned_at = CURRENT_TIMESTAMP, expires_at = VALUES(expires_at)`,
                [ip, reason || null, hits || 1, BAN_DURATION_DAYS]
            );
        } catch (error) {
            logger.error('Error registrando baneo de IP en BD', { error: error.message, ip });
        }
    }

    /**
     * Chequeo rápido usado en caliente por el middleware: solo lee memoria,
     * nunca golpea la BD por petición.
     */
    static isBanned(ip) {
        return Boolean(cacheService.get(cacheKey(ip)));
    }
}

module.exports = IpBanService;
