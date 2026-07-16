require('dotenv').config();
require('dns').setDefaultResultOrder('ipv4first'); // FUERZA IPv4 A NIVEL GLOBAL

const { validateEnv } = require('./config/env');
validateEnv();

// Sentry — debe inicializarse antes que cualquier otro require de la app
if (process.env.SENTRY_DSN) {
    const Sentry = require('@sentry/node');
    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV || 'development',
        tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0
    });
}

const app = require('./app');
const db = require('./config/database');
const { createRequiredDirectories } = require('./config/setup');
const { runBackgroundJobs } = require('./config/bootstrap');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        createRequiredDirectories();

        logger.info('Intentando conectar a la base de datos...');
        const connection = await db.getConnection();
        connection.release();
        logger.info('Conexión exitosa a la base de datos');

        const server = app.listen(PORT, '0.0.0.0', async () => {
            logger.info(`Servidor iniciado`, { port: PORT, env: process.env.NODE_ENV || 'development' });
            await runBackgroundJobs();
        });

        server.on('error', error => {
            const message =
                error.code === 'EADDRINUSE'
                    ? `Puerto ${PORT} en uso`
                    : `Error al iniciar el servidor: ${error.message}`;
            fatalExit(message, { port: PORT, error: error.message });
        });
    } catch (err) {
        fatalExit('Error fatal al iniciar el sistema', { error: err.message, stack: err.stack });
    }
}

// El transport de archivo de Winston escribe de forma asíncrona; llamar a
// process.exit() justo después de logger.error() puede matar el proceso antes
// de que la escritura llegue a disco (visto en el prototipo de escritorio,
// donde además no hay consola: el fallo de arranque quedaba completamente
// silencioso, sin log y sin salida visible). console.error queda como
// respaldo síncrono para estos casos fatales de arranque.
function fatalExit(message, meta) {
    console.error(message, meta);
    logger.error(message, meta);
    setTimeout(() => process.exit(1), 100);
}

process.on('uncaughtException', err => {
    fatalExit('Excepción no capturada', { error: err.message, stack: err.stack });
});

process.on('unhandledRejection', reason => {
    logger.error('Promesa rechazada sin manejar', { reason: String(reason) });
});

process.on('SIGTERM', () => {
    logger.info('Recibida señal SIGTERM. Cerrando servidor...');
    process.exit(0);
});

process.on('SIGINT', () => {
    logger.info('Recibida señal SIGINT. Cerrando servidor...');
    process.exit(0);
});

// Arrancar en entorno común o exportar app para tests
if (require.main === module && process.env.NODE_ENV !== 'test') {
    startServer();
}

module.exports = { app, startServer };
