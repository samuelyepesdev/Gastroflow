const { ipKeyGenerator } = require('express-rate-limit');
const { getClientIp } = require('./clientIp');

/**
 * keyGenerator común de los rate limiters por IP. Detrás de Cloudflare (trust proxy = 1) `req.ip` es la
 * IP del nodo de borde, compartida por muchos clientes: sin esto, 5 logins fallidos de una persona
 * bloquean a todos los que pasan por ese nodo.
 */
const keyPorIp = req => ipKeyGenerator(getClientIp(req));

module.exports = { keyPorIp };
