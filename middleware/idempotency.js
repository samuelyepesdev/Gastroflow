const cacheService = require('../services/Shared/CacheService');

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

    const cacheKey = `idemp:${key}`;
    const processingKey = `idemp_processing:${key}`;

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
            cacheService.set(cacheKey, {
                status: res.statusCode,
                body: body,
                headers: {
                    'Content-Type': 'application/json'
                }
            }, 1800); // Mantener en caché por 30 minutos (1800 segundos)
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
                } catch (_) {}
                
                cacheService.set(cacheKey, {
                    status: res.statusCode,
                    body: parsedBody,
                    headers: {
                        'Content-Type': res.getHeader('Content-Type') || 'application/json'
                    }
                }, 1800);
            }
        }
        return originalSend.call(this, body);
    };

    next();
};
