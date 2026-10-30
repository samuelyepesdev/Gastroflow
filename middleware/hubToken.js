const crypto = require('crypto');

/**
 * Protege las rutas que consume Safe Hub con un token Bearer compartido (HUB_TOKEN).
 * - Sin HUB_TOKEN configurado la integración está apagada: responde 404 como si
 *   la ruta no existiera.
 * - Compara en tiempo constante (hash previo para igualar longitudes).
 */
function hubToken(req, res, next) {
    const esperado = process.env.HUB_TOKEN;
    if (!esperado) {
        return res.status(404).json({ error: 'No encontrado' });
    }

    const enviado = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const hash = valor => crypto.createHash('sha256').update(valor).digest();

    if (!enviado || !crypto.timingSafeEqual(hash(enviado), hash(esperado))) {
        return res.status(401).json({ error: 'Token inválido' });
    }
    next();
}

module.exports = hubToken;
