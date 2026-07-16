const mysql = require('mysql2');

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
              connectionLimit: 10,
              queueLimit: 0,
              timezone: 'Z',
              dateStrings: true,
              charset: 'utf8mb4'
          };

const pool =
    typeof connectionConfig === 'string'
        ? mysql.createPool(connectionConfig, { timezone: 'Z', dateStrings: true }).promise()
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
