const net = require('net');

/**
 * IP real del cliente.
 *
 * Detrás del proxy de Cloudflare, req.ip (con `trust proxy` = 1) es la IP del
 * nodo de Cloudflare, no la del cliente: muchos usuarios sin relación
 * terminarían compartiendo "la misma IP" en el rate limiter y en los logs.
 * Cloudflare manda la IP real en CF-Connecting-IP; sin Cloudflare delante la
 * cabecera no viene y caemos a req.ip, así que es seguro en ambos escenarios.
 *
 * Solo se acepta si es una IP válida, para no usar como clave basura arbitraria.
 */
function getClientIp(req) {
    const cfIp = req.headers['cf-connecting-ip'];
    if (typeof cfIp === 'string' && net.isIP(cfIp.trim())) {
        return cfIp.trim();
    }
    return req.ip || req.connection?.remoteAddress;
}

module.exports = { getClientIp };
