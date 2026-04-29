const db = require('../../../config/database');

class GenerarTokensQRService {
    /**
     * @description Genera tokens QR para todas las mesas que no tienen uno.
     */
    static async execute({ tenantId }) {
        const crypto = require('crypto');
        const [mesasSinToken] = await db.query(
            'SELECT id FROM mesas WHERE tenant_id = ? AND qr_token IS NULL', 
            [tenantId]
        );
        
        let generados = 0;
        for (const mesa of mesasSinToken) {
            const randomString = crypto.randomBytes(8).toString('hex');
            const token = `t${tenantId}-m${mesa.id}-${randomString}`;
            await db.query('UPDATE mesas SET qr_token = ? WHERE id = ?', [token, mesa.id]);
            generados++;
        }
        
        return { message: `Se generaron tokens QR para ${generados} mesas`, generados };
    }
}

module.exports = GenerarTokensQRService;
