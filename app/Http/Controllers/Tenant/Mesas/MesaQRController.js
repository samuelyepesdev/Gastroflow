const db = require('../../../../../config/database');
const { obtenerBaseUrl } = require('../../../../../utils/baseUrl');
const GenerarTokensQRService = require('../../../../../services/Tenant/Mesas/GenerarTokensQRService');

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
            const [mesas] = await db.query(
                `
                SELECT id, numero, descripcion, qr_token 
                FROM mesas 
                WHERE tenant_id = ? AND tipo = 'fisica' 
                ORDER BY CAST(numero AS UNSIGNED), numero
            `,
                [tenantId]
            );

            // APP_URL (canónica) o, solo fuera de producción, el Host validado de la petición. Siempre con
            // http(s):// para que el celular lo reconozca como enlace. No se confía en X-Forwarded-Host.
            const baseUrl = obtenerBaseUrl(req);
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
