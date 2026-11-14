/**
 * GET /auth/logout se sigue aceptando (los enlaces "Cerrar sesión" de la interfaz son GET), pero se rechaza
 * cuando la petición la origina OTRO sitio (p. ej. <img src="https://gastroflow.../auth/logout"> en una
 * página ajena, que cerraba la sesión sin que el usuario lo supiera). Los navegadores modernos envían
 * Sec-Fetch-Site; sin esa cabecera (clientes antiguos, curl) se deja pasar.
 */
function bloquearLogoutCrossSite(req, res, next) {
    const sitio = req.headers['sec-fetch-site'];
    if (sitio === 'cross-site') {
        return res.status(403).json({ error: 'Solicitud no permitida' });
    }
    return next();
}

module.exports = bloquearLogoutCrossSite;
