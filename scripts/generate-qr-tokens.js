require('dotenv').config();
const db = require('../config/database');
const crypto = require('crypto');

async function generateQRTokens() {
    try {
        console.log('Iniciando generación de tokens QR para mesas existentes...');
        
        // Buscar mesas sin token
        const [mesas] = await db.query('SELECT id, tenant_id, numero FROM mesas WHERE qr_token IS NULL');
        
        if (mesas.length === 0) {
            console.log('Todas las mesas ya tienen un token QR.');
            process.exit(0);
        }

        let actualizadas = 0;
        for (const mesa of mesas) {
            // Generar un string seguro: combinamos el tenant_id, mesa_id y un string aleatorio
            const randomString = crypto.randomBytes(8).toString('hex');
            const token = `t${mesa.tenant_id}-m${mesa.id}-${randomString}`;
            
            await db.query('UPDATE mesas SET qr_token = ? WHERE id = ?', [token, mesa.id]);
            actualizadas++;
        }
        
        console.log(`✅ Tokens QR generados exitosamente para ${actualizadas} mesas.`);
        process.exit(0);
    } catch (error) {
        console.error('❌ Error al generar tokens:', error);
        process.exit(1);
    }
}

generateQRTokens();
