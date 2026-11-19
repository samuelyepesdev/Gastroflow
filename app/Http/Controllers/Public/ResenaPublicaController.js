const ResenaService = require('../../../../services/Tenant/ResenaService');
const { responderError } = require('../../../../utils/errors');

const SIN_CACHE = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };

class ResenaPublicaController {
    // GET /resena/:token
    static async pagina(req, res) {
        res.set(SIN_CACHE);
        try {
            const vista = await ResenaService.vistaPublica(req.params.token);
            if (!vista) {
                return res.status(404).render('resenas/publica_no_disponible');
            }
            res.render('resenas/publica', { vista, token: req.params.token });
        } catch (error) {
            console.error('Error en ResenaPublicaController.pagina:', error);
            res.status(500).render('resenas/publica_no_disponible');
        }
    }

    // POST /resena/:token
    static async crear(req, res) {
        res.set(SIN_CACHE);
        try {
            // Campo trampa: las personas no lo ven y los bots lo llenan. Se responde "ok" sin guardar nada.
            if (req.body?.web) {
                return res.status(201).json({ ok: true, baja: false });
            }
            const r = await ResenaService.crearPublica(req.params.token, req.body, req.ip);
            res.status(201).json({ ok: true, baja: r.baja });
        } catch (error) {
            console.error('Error en ResenaPublicaController.crear:', error.message);
            responderError(res, error, 'No se pudo enviar tu opinión. Intenta de nuevo.');
        }
    }
}

module.exports = ResenaPublicaController;
