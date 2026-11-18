const TemaTemporadaService = require('../../../../services/Tenant/TemaTemporadaService');
const { hoyColombia } = require('../../../../utils/dateHelpers');
const { responderError } = require('../../../../utils/errors');

class TemporadaAdminController {
    // GET /admin/temporada
    static async index(req, res) {
        try {
            const hoy = hoyColombia();
            const [global, restaurantes] = await Promise.all([
                TemaTemporadaService.getGlobal(),
                TemaTemporadaService.listarRestaurantes(hoy)
            ]);
            res.render('admin/temporada/index', {
                user: req.user,
                title: 'Look de temporada',
                currentAdminPage: 'temporada',
                global,
                sugerida: TemaTemporadaService.ventanaSugerida(hoy),
                restaurantes
            });
        } catch (error) {
            console.error('Error al cargar el look de temporada:', error);
            res.status(500).render('errors/generic', { error: { message: 'Error al cargar el look de temporada' } });
        }
    }

    // PUT /admin/temporada/global  (activa o apaga para todos los restaurantes que no hayan decidido)
    static async guardarGlobal(req, res) {
        try {
            res.json({ global: await TemaTemporadaService.guardarGlobal(req.body) });
        } catch (error) {
            console.error('Error al guardar el look global:', error);
            responderError(res, error, 'No se pudo guardar el look de temporada');
        }
    }

    // PUT /admin/temporada/restaurantes/:id  { estado: 'heredar' | 'activado' | 'apagado' }
    static async setEstado(req, res) {
        try {
            res.json(await TemaTemporadaService.setEstadoRestaurante(req.params.id, req.body?.estado));
        } catch (error) {
            console.error('Error al cambiar el look de un restaurante:', error);
            responderError(res, error, 'No se pudo cambiar el estado del restaurante');
        }
    }
}

module.exports = TemporadaAdminController;
