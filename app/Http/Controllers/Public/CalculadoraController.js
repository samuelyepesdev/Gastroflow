const CalculadoraService = require('../../../../services/Public/CalculadoraService');
const LandingSettingsService = require('../../../../services/Admin/LandingSettingsService');
const { responderError } = require('../../../../utils/errors');

class CalculadoraController {
    // GET /calculadora
    static async pagina(req, res) {
        let settings = {};
        try {
            settings = await LandingSettingsService.getAll();
        } catch (error) {
            console.error('Error al leer ajustes de la landing para la calculadora:', error.message);
        }
        res.render('calculadora/index', { settings });
    }

    // POST /calculadora/calcular
    static async calcular(req, res) {
        res.set('Cache-Control', 'no-store');
        try {
            // Campo trampa: las personas no lo ven y los bots lo llenan. Se responde sin guardar nada.
            if (req.body?.web) {
                return res.status(201).json({ ok: true, resultado: null });
            }
            const resultado = await CalculadoraService.calcularYRegistrar(req.body, req.ip);
            res.status(201).json({ ok: true, resultado });
        } catch (error) {
            console.error('Error en CalculadoraController.calcular:', error.message);
            responderError(res, error, 'No se pudo calcular. Intenta de nuevo.');
        }
    }
}

module.exports = CalculadoraController;
