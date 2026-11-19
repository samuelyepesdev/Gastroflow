const CalculadoraService = require('../../../../services/Public/CalculadoraService');
const { responderError, NotFoundError } = require('../../../../utils/errors');

class LeadsController {
    // GET /admin/leads
    static async index(req, res) {
        try {
            const leads = await CalculadoraService.listar();
            res.render('admin/leads/index', {
                user: req.user,
                title: 'Prospectos',
                currentAdminPage: 'leads',
                leads
            });
        } catch (error) {
            console.error('Error al cargar los prospectos:', error);
            res.status(500).render('errors/generic', { error: { message: 'Error al cargar los prospectos' } });
        }
    }

    // PATCH /admin/leads/:id/contactado
    static async setContactado(req, res) {
        try {
            const ok = await CalculadoraService.marcarContactado(Number(req.params.id), req.body?.contactado === true);
            if (!ok) {
                throw new NotFoundError('Prospecto no encontrado', 'LEAD_NO_ENCONTRADO');
            }
            res.json({ ok: true });
        } catch (error) {
            console.error('Error al marcar el prospecto:', error.message);
            responderError(res, error, 'No se pudo actualizar el prospecto');
        }
    }
}

module.exports = LeadsController;
