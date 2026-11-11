const crypto = require('crypto');
const CacheService = require('../../Shared/CacheService');

/**
 * Acciones de escritura pendientes de confirmar. La acción vive SOLO en el servidor: al cliente se le da
 * un id opaco, nunca los ids de mesa o producto, así que no puede cambiar lo que se va a ejecutar.
 *
 *  - Una sola pendiente por usuario (la nueva reemplaza a la anterior): acota la memoria y encaja con un
 *    flujo de voz secuencial.
 *  - Un solo uso: consumir la borra.
 *  - Ligada a tenant + usuario: nadie más puede confirmarla.
 *
 * Usa el CacheService en memoria, con el mismo límite que el SSE: funciona con un único proceso.
 */

const TTL_SEGUNDOS = 120;
const FORMATO_ID = /^[0-9a-f]{32}$/;

const clave = (tenantId, userId) => `asistente:conf:${tenantId}:${userId}`;

/** @returns {string} id opaco de la confirmación */
function crear({ tenantId, userId, accion, resumen }) {
    const id = crypto.randomBytes(16).toString('hex');
    CacheService.set(clave(tenantId, userId), { id, accion, resumen }, TTL_SEGUNDOS);
    return id;
}

/** @returns {{accion:Object, resumen:string}|null} null si no existe, venció, ya se usó o no es de este usuario */
function consumir({ tenantId, userId, id }) {
    if (typeof id !== 'string' || !FORMATO_ID.test(id)) {
        return null;
    }
    const k = clave(tenantId, userId);
    const pendiente = CacheService.get(k);
    if (!pendiente || pendiente.id !== id) {
        return null;
    }
    CacheService.delete(k);
    return { accion: pendiente.accion, resumen: pendiente.resumen };
}

module.exports = { crear, consumir, TTL_SEGUNDOS };
