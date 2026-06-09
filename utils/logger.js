const { createLogger, format, transports } = require('winston');
const path = require('path');
const fs = require('fs');

const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

const jsonFormat = format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.json()
);

const logger = createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: jsonFormat,
    transports: [
        new transports.File({
            filename: path.join(logsDir, 'error.log'),
            level: 'error',
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 5
        }),
        new transports.File({
            filename: path.join(logsDir, 'combined.log'),
            maxsize: 10 * 1024 * 1024,
            maxFiles: 10
        })
    ]
});

// Audit logger separado para eventos de autenticación
const auditLogger = createLogger({
    level: 'info',
    format: jsonFormat,
    transports: [
        new transports.File({
            filename: path.join(logsDir, 'audit.log'),
            maxsize: 10 * 1024 * 1024,
            maxFiles: 30
        })
    ]
});

if (process.env.NODE_ENV !== 'production') {
    const consoleFormat = format.combine(
        format.colorize(),
        format.printf(({ level, message, timestamp, ...meta }) => {
            const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
            return `${timestamp} [${level}]: ${message}${metaStr}`;
        })
    );
    logger.add(new transports.Console({ format: consoleFormat }));
    auditLogger.add(new transports.Console({ format: consoleFormat }));
}

/**
 * Registra un evento de auditoría de autenticación
 * @param {string} action - Acción realizada (login.success, login.failed, logout, password.changed)
 * @param {Object} meta - Metadatos del evento (userId, username, ip, tenant_id, reason)
 */
function audit(action, meta = {}) {
    auditLogger.info(action, { audit: true, ...meta });
}

module.exports = logger;
module.exports.audit = audit;
