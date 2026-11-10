const logger = require('../utils/logger');

/**
 * Global Express error handler. Client errors raised by body-parser or other
 * middleware (malformed JSON, payload too large...) keep their own 4xx status;
 * everything else is a 500 with a generic message.
 */
function errorHandler(err, req, res, _next) {
    logger.error('Error en la aplicación', {
        error: err.message,
        stack: err.stack,
        url: req.originalUrl,
        method: req.method
    });

    const clientStatus = err.status || err.statusCode;
    const isClientError = Number.isInteger(clientStatus) && clientStatus >= 400 && clientStatus < 500;
    const status = isClientError ? clientStatus : 500;
    const message = isClientError ? 'Solicitud inválida' : 'Error interno del servidor';

    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
        return res.status(status).json({ error: message });
    }
    return res.status(status).render('errors/internal', { error: { message } });
}

module.exports = errorHandler;
