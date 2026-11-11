const { rateLimit } = require('express-rate-limit');

/**
 * Límites del asistente, por minuto. Cada comando cuesta una (o varias) llamadas al proveedor de IA,
 * cuyo tier gratuito es pequeño: hay que repartirlo y evitar que un usuario o restaurante lo agote.
 * Se cuentan por usuario y por restaurante (no por IP: detrás de un mismo local todos comparten IP).
 *
 * Configurables con ASISTENTE_LIMITE_USUARIO_MIN, ASISTENTE_LIMITE_TENANT_MIN y
 * ASISTENTE_LIMITE_CONFIRMAR_MIN. Memoria del proceso, igual que el rate limit global.
 */

const VENTANA_MS = 60 * 1000;

function entero(valor, defecto) {
    const n = Number.parseInt(valor, 10);
    return n > 0 ? n : defecto;
}

function crearLimitador({ max, clave, mensaje }) {
    return rateLimit({
        windowMs: VENTANA_MS,
        limit: max,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: clave,
        message: { tipo: 'error', codigo: 'limite', texto: mensaje }
    });
}

function crearLimitesAsistente(env = process.env) {
    return {
        usuario: crearLimitador({
            max: entero(env.ASISTENTE_LIMITE_USUARIO_MIN, 15),
            clave: req => `u:${req.tenant.id}:${req.user.id}`,
            mensaje: 'Vas muy rápido con el asistente. Espera un momento e inténtalo de nuevo.'
        }),
        tenant: crearLimitador({
            max: entero(env.ASISTENTE_LIMITE_TENANT_MIN, 60),
            clave: req => `t:${req.tenant.id}`,
            mensaje: 'Tu restaurante está usando mucho el asistente. Inténtalo de nuevo en un momento.'
        }),
        confirmar: crearLimitador({
            max: entero(env.ASISTENTE_LIMITE_CONFIRMAR_MIN, 60),
            clave: req => `c:${req.tenant.id}:${req.user.id}`,
            mensaje: 'Demasiadas confirmaciones seguidas. Espera un momento.'
        })
    };
}

module.exports = { crearLimitesAsistente };
