const crypto = require('crypto');
const cacheService = require('../services/Shared/CacheService');
const { getClientIp } = require('../utils/clientIp');

// Rutas donde nunca se interceptan ni cachean respuestas (login devuelve el token; los webhooks
// los firma un tercero y se deduplican por su propio id de evento).
const RUTAS_EXCLUIDAS = [/^\/auth(\/|$)/, /^\/webhooks?(\/|$)/];

/**
 * Identidad con la que se aísla la clave: este middleware corre antes de requireAuth, así que no hay
 * req.user; se usa un hash del token de sesión (cookie o Bearer). Sin sesión, la IP del cliente.
 * Así la misma llave enviada por otro usuario/tenant o sin autenticar nunca recibe la respuesta ajena.
 */
function alcanceDeIdentidad(req) {
    const auth = req.headers.authorization;
    const bearer = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const token = (req.cookies && req.cookies.auth_token) || bearer;
    if (token) {
        return `u:${crypto.createHash('sha256').update(String(token)).digest('hex').slice(0, 32)}`;
    }
    return `anon:${getClientIp(req)}`;
}

/**
 * Middleware de Idempotencia para Express
 * Protege contra peticiones duplicadas y dobles clics en operaciones mutativas (POST, PUT, DELETE).
 * Utiliza CacheService para el bloqueo por clave de idempotencia y prevención de colisiones.
 */
module.exports = function (req, res, next) {
    const mutatingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];

    // Solo interceptar peticiones mutativas
    if (!mutatingMethods.includes(req.method)) {
        return next();
    }

    const key = req.headers['idempotency-key'] || req.headers['Idempotency-Key'];
    if (!key) {
        return next(); // Si no hay llave, continuar de manera estándar (no-idempotente)
    }

    const ruta = String(req.originalUrl || req.url || '').split('?')[0];
    if (RUTAS_EXCLUIDAS.some(re => re.test(ruta))) {
        return next();
    }

    const huella = `${alcanceDeIdentidad(req)}:${req.method}:${ruta}:${key}`;
    const cacheKey = `idemp:${huella}`;
    const processingKey = `idemp_processing:${huella}`;

    // 1. Verificar si la respuesta ya está cacheada
    const cachedResponse = cacheService.get(cacheKey);
    if (cachedResponse) {
        console.log(`[Idempotencia] Bloqueada petición duplicada para la llave: ${key}`);
        res.status(cachedResponse.status);

        if (cachedResponse.headers) {
            Object.keys(cachedResponse.headers).forEach(h => {
                res.setHeader(h, cachedResponse.headers[h]);
            });
        }

        return res.json(cachedResponse.body);
    }

    // 2. Controlar colisión de peticiones concurrentes simultáneas (doble clic rápido)
    const isProcessing = cacheService.get(processingKey);
    if (isProcessing) {
        return res.status(409).json({
            error: 'Esta petición ya se está procesando actualmente. Por favor, espere un momento.'
        });
    }

    // Marcar como "procesando" con un bloqueo de seguridad de 30 segundos
    cacheService.set(processingKey, true, 30);

    // 3. Interceptar res.json para guardar de manera transparente la respuesta exitosa
    const originalJson = res.json;
    res.json = function (body) {
        cacheService.delete(processingKey); // Liberar bloqueo de procesamiento

        // Solo cachear respuestas exitosas (status 2xx)
        if (res.statusCode >= 200 && res.statusCode < 300) {
            cacheService.set(
                cacheKey,
                {
                    status: res.statusCode,
                    body: body,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                },
                1800
            ); // Mantener en caché por 30 minutos (1800 segundos)
        }

        return originalJson.call(this, body);
    };

    // 4. Interceptar res.send por compatibilidad general de Express
    const originalSend = res.send;
    res.send = function (body) {
        const alreadyHandled = cacheService.get(cacheKey);
        if (!alreadyHandled) {
            cacheService.delete(processingKey); // Liberar bloqueo

            if (res.statusCode >= 200 && res.statusCode < 300) {
                let parsedBody = body;
                try {
                    parsedBody = typeof body === 'string' ? JSON.parse(body) : body;
                } catch (_) {
                    /* intentional */
                }

                cacheService.set(
                    cacheKey,
                    {
                        status: res.statusCode,
                        body: parsedBody,
                        headers: {
                            'Content-Type': res.getHeader('Content-Type') || 'application/json'
                        }
                    },
                    1800
                );
            }
        }
        return originalSend.call(this, body);
    };

    next();
};
