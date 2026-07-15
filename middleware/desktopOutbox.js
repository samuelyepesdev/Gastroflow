/**
 * queueForSync - Encola la acción en sync_outbox después de una respuesta
 * exitosa, solo cuando este proceso corre en modo desktop (SYNC_API_URL
 * seteado). En producción normal es un no-op puro: DesktopSyncService ni
 * siquiera se consulta más allá del check de isDesktopMode().
 *
 * `action` debe coincidir con una de las acciones que despacha SyncService.js
 * del lado servidor (ver services/Tenant/SyncService.js), porque este mismo
 * string es el que se manda de vuelta en el push.
 */

const DesktopSyncService = require('../services/Shared/DesktopSyncService');
const logger = require('../utils/logger');

function queueForSync(action) {
    return (req, res, next) => {
        if (!DesktopSyncService.isDesktopMode()) {
            return next();
        }

        const originalJson = res.json.bind(res);
        res.json = body => {
            if (res.statusCode < 400) {
                const params = { ...req.params, ...req.body };
                DesktopSyncService.enqueue(action, params).catch(error => {
                    logger.error('No se pudo encolar acción para sync', { action, error: error.message });
                });
            }
            return originalJson(body);
        };
        next();
    };
}

module.exports = { queueForSync };
