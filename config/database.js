const mysql = require('mysql2');

const POOL_SIZE = 20;

// Unified database configuration
// Supports: MYSQL_URL (Railway, etc.), or DB_HOST + DB_USER + DB_PASSWORD + DB_NAME
const connectionConfig =
    process.env.MYSQL_URL || process.env.DATABASE_URL
        ? process.env.MYSQL_URL || process.env.DATABASE_URL
        : {
              host: process.env.DB_HOST || 'localhost',
              port: process.env.DB_PORT || 3306,
              user: process.env.DB_USER || 'root',
              password: process.env.DB_PASSWORD || '',
              database: process.env.DB_NAME || 'restaurante',
              waitForConnections: true,
              connectionLimit: POOL_SIZE,
              queueLimit: 0,
              timezone: 'Z',
              dateStrings: true,
              charset: 'utf8mb4'
          };

// El dashboard de un tenant lanza ~18 consultas en paralelo al refrescar sus
// estadísticas: con el default de 10 conexiones, eso bloqueaba por un momento
// el resto de peticiones (Mesas, POS). 20 sigue muy por debajo del
// max_connections de MySQL (151 por defecto), incluso con 2 instancias
// solapadas durante un deploy.
//
// OJO (modo URL / producción): mysql.createPool() solo lee su PRIMER argumento,
// así que el { timezone: 'Z', dateStrings: true } que se pasaba de segundo
// argumento nunca tuvo efecto -- producción corre con los defaults de mysql2
// (timezone 'local', fechas como objetos Date). Se conserva ese comportamiento
// a propósito: activarlo ahora cambiaría cómo se leen todas las fechas en prod.
const pool =
    typeof connectionConfig === 'string'
        ? mysql.createPool({ uri: connectionConfig, connectionLimit: POOL_SIZE }).promise()
        : mysql.createPool(connectionConfig).promise();

// Verify connection on startup
pool.getConnection()
    .then(connection => {
        console.log('Conexión exitosa a la base de datos');
        connection.release();
    })
    .catch(err => {
        console.error('Error al conectar a la base de datos:', err);
    });

module.exports = pool;
