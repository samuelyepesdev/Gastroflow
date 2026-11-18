const ReservaService = require('../../../../services/Tenant/ReservaService');
const { hoyColombia } = require('../../../../utils/dateHelpers');
const { responderError } = require('../../../../utils/errors');

const SIN_CACHE = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };

class ReservaPublicaController {
    // GET /reservar/:token
    static async pagina(req, res) {
        res.set(SIN_CACHE);
        try {
            const vista = await ReservaService.vistaPublica(req.params.token);
            if (!vista) {
                return res.status(404).render('reservas/publica_no_disponible');
            }
            res.render('reservas/publica', { vista, token: req.params.token, hoy: hoyColombia() });
        } catch (error) {
            console.error('Error en ReservaPublicaController.pagina:', error);
            res.status(500).render('reservas/publica_no_disponible');
        }
    }

    // GET /reservar/:token/disponibilidad?fecha=YYYY-MM-DD&personas=2
    static async disponibilidad(req, res) {
        res.set(SIN_CACHE);
        try {
            const franjas = await ReservaService.disponibilidadPublica(req.params.token, req.query.fecha, req.query.personas);
            res.json({ franjas });
        } catch (error) {
            console.error('Error en ReservaPublicaController.disponibilidad:', error.message);
            responderError(res, error, 'No se pudo consultar la disponibilidad');
        }
    }

    // POST /reservar/:token
    static async crear(req, res) {
        res.set(SIN_CACHE);
        try {
            // Campo trampa: las personas no lo ven; los bots lo llenan. Se responde "ok" sin crear nada.
            if (req.body?.web) {
                return res.status(201).json({ ok: true, estado: 'pendiente' });
            }
            const r = await ReservaService.crearPublica(req.params.token, req.body, req.ip);
            res.status(201).json({ ok: true, estado: r.estado });
        } catch (error) {
            console.error('Error en ReservaPublicaController.crear:', error.message);
            responderError(res, error, 'No se pudo crear la reserva. Intenta de nuevo.');
        }
    }
}

module.exports = ReservaPublicaController;
