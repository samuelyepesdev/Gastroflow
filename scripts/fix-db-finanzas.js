const mysql = require('mysql2/promise');
require('dotenv').config();

async function fix() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'restaurante'
    });

    console.log('🚀 Asegurando estructura de finanzas...');

    const columns = [
        { name: 'categoria_gasto', definition: 'VARCHAR(50) NULL AFTER motivo' },
        { name: 'referencia_tipo', definition: 'VARCHAR(30) NULL AFTER categoria_gasto' },
        { name: 'referencia_id', definition: 'INT NULL AFTER referencia_tipo' }
    ];

    for (const col of columns) {
        try {
            await connection.query(`ALTER TABLE caja_movimientos ADD COLUMN ${col.name} ${col.definition}`);
            console.log(`✅ Columna ${col.name} creada.`);
        } catch (err) {
            if (err.code === 'ER_DUP_COLUMN_NAME') {
                console.log(`⏭️ Columna ${col.name} ya existe, omitiendo.`);
            } else {
                console.error(`❌ Error en ${col.name}:`, err.message);
            }
        }
    }

    try {
        await connection.query('ALTER TABLE caja_movimientos MODIFY COLUMN sesion_id INT NULL');
        console.log('✅ sesion_id ajustado a NULL.');
    } catch (err) {
        console.error('❌ Error ajustando sesion_id:', err.message);
    }

    await connection.end();
    console.log('🏁 Proceso completado.');
}

fix().catch(console.error);
