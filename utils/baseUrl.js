/**
 * URL base pública de la app. La cabecera Host / X-Forwarded-Host la controla quien hace la petición:
 * usarla tal cual para armar sitemaps o enlaces permite inyectar un dominio ajeno (Host header injection).
 * La fuente canónica es APP_URL; el Host de la petición solo se usa como respaldo (desarrollo, Electron)
 * y únicamente si tiene forma de host válido.
 */
const DOMINIO_POR_DEFECTO = 'https://gastroflow.digital';
const HOST_VALIDO = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/i;

function deAppUrl() {
    const url = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
    return /^https?:\/\/[^\s/]+$/i.test(url) ? url : null;
}

function deLaPeticion(req) {
    const host = String((req.headers && req.headers.host) || '').trim();
    if (!HOST_VALIDO.test(host)) {
        return null;
    }
    const protocolo = req.protocol === 'http' || req.protocol === 'https' ? req.protocol : 'https';
    return `${protocolo}://${host}`;
}

/**
 * @param {import('express').Request} req
 * @param {{ permitirHostDePeticion?: boolean }} [opciones] - false (sitemap, público) nunca confía en el Host
 *   en producción.
 */
function obtenerBaseUrl(req, { permitirHostDePeticion = true } = {}) {
    const configurada = deAppUrl();
    if (configurada) {
        return configurada;
    }
    const enProduccion = process.env.NODE_ENV === 'production';
    if (permitirHostDePeticion && !enProduccion) {
        return deLaPeticion(req) || DOMINIO_POR_DEFECTO;
    }
    return DOMINIO_POR_DEFECTO;
}

module.exports = { obtenerBaseUrl };
