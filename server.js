require('dotenv').config();
require('dns').setDefaultResultOrder('ipv4first'); // FUERZA IPv4 A NIVEL GLOBAL

const { validateEnv } = require('./config/env');
validateEnv();

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
            if (error.code === 'EADDRINUSE') {
                logger.error(`Puerto ${PORT} en uso`, { port: PORT });
            } else {
                logger.error('Error al iniciar el servidor', { error: error.message });
            }
            process.exit(1);
        });
    } catch (err) {
        logger.error('Error fatal al iniciar el sistema', { error: err.message, stack: err.stack });
        process.exit(1);
    }
}

process.on('uncaughtException', err => {
    logger.error('Excepción no capturada', { error: err.message, stack: err.stack });
    process.exit(1);
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
