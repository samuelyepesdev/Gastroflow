const MenuPersonalService = require('../../../../services/Shared/MenuPersonalService');
const { responderError } = require('../../../../utils/errors');

class MenuPersonalController {
    // GET /api/menu-personal
    static async index(req, res) {
        try {
            res.json({ oculto: await MenuPersonalService.getOcultos(req.user.id) });
        } catch (error) {
            console.error('Error al leer el menú personal:', error);
            responderError(res, error, 'No se pudo leer tu menú');
        }
    }

    // PUT /api/menu-personal  { oculto: ['finanzas', 'bonos'] }
    static async guardar(req, res) {
        try {
            res.json({ oculto: await MenuPersonalService.guardar(req.user.id, req.body?.oculto) });
        } catch (error) {
            console.error('Error al guardar el menú personal:', error);
            responderError(res, error, 'No se pudo guardar tu menú');
        }
    }

    // DELETE /api/menu-personal  (volver a mostrar todo)
    static async restablecer(req, res) {
        try {
            res.json({ oculto: await MenuPersonalService.restablecer(req.user.id) });
        } catch (error) {
            console.error('Error al restablecer el menú personal:', error);
            responderError(res, error, 'No se pudo restablecer tu menú');
        }
    }
}

module.exports = MenuPersonalController;
