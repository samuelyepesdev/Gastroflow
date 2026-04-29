const db = require('../../../../config/database');
const GenerarTokensQRService = require('../../../../services/Tenant/Mesas/GenerarTokensQRService');

class MesaQRController {
    // POST /mesas/qrs/generar
    static async generar(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const resultado = await GenerarTokensQRService.execute({ tenantId });
            res.json(resultado);
        } catch (error) {
            res.status(500).json({ error: 'Error al generar tokens QR' });
        }
    }

    // GET /mesas/qrs/imprimir
    static async imprimir(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const [mesas] = await db.query(`
                SELECT id, numero, descripcion, qr_token 
                FROM mesas 
                WHERE tenant_id = ? AND tipo = 'fisica' 
                ORDER BY CAST(numero AS UNSIGNED), numero
            `, [tenantId]);

            const baseUrl = req.protocol + '://' + req.get('host');
            res.render('mesas/qrs', {
                mesas,
                baseUrl,
                user: req.user,
                tenant: req.tenant
            });
        } catch (error) {
            res.status(500).render('errors/internal', { error: { message: 'Error al cargar QRs' } });
        }
    }
}

module.exports = MesaQRController;
