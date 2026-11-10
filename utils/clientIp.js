const crypto = require('crypto');
const net = require('net');

/**
 * ¿La petición viene realmente de Cloudflare?
 *
 * CF-Connecting-IP es una cabecera cualquiera: si el servidor es alcanzable sin pasar por
 * Cloudflare (p. ej. la URL *.up.railway.app, o un Host falso contra el borde de Railway), un
 * cliente puede enviarla con la IP que quiera y esquivar el rate limiter o falsear los logs.
 *
 * Si CF_ORIGIN_SECRET está definida, solo se confía en CF-Connecting-IP cuando la petición lleva
 * X-Origin-Secret con ese mismo valor (una regla "Modify Request Header" de Cloudflare lo añade a
 * todo lo que reenvía). Sin la variable se mantiene el comportamiento anterior, para poder
 * desplegar el código antes de configurar Cloudflare.
 */
function viniendoDeCloudflare(req) {
    const secreto = process.env.CF_ORIGIN_SECRET;
    if (!secreto) {
        return true;
    }
    const recibido = req.headers['x-origin-secret'];
    if (typeof recibido !== 'string') {
        return false;
    }
    const a = crypto.createHash('sha256').update(recibido).digest();
    const b = crypto.createHash('sha256').update(secreto).digest();
    return crypto.timingSafeEqual(a, b);
}

/**
 * IP real del cliente.
 *
 * Detrás del proxy de Cloudflare, req.ip (con `trust proxy` = 1) es la IP del
 * nodo de Cloudflare, no la del cliente: muchos usuarios sin relación
 * terminarían compartiendo "la misma IP" en el rate limiter y en los logs.
 * Cloudflare manda la IP real en CF-Connecting-IP; sin Cloudflare delante la
 * cabecera no viene y caemos a req.ip, así que es seguro en ambos escenarios.
 *
 * Solo se acepta si es una IP válida y la petición viene de Cloudflare (ver arriba).
 */
function getClientIp(req) {
    const cfIp = req.headers['cf-connecting-ip'];
    if (typeof cfIp === 'string' && net.isIP(cfIp.trim()) && viniendoDeCloudflare(req)) {
        return cfIp.trim();
    }
    return req.ip || req.connection?.remoteAddress;
}

module.exports = { getClientIp };
