const CartaFotoService = require('../../../../services/Tenant/CartaFotoService');
const { LlmError } = require('../../../../services/Tenant/Asistente/llm/errores');
const { asistenteConfigurado } = require('../../../../services/Tenant/Asistente/llm');
const { responderError } = require('../../../../utils/errors');

// Estado HTTP y mensaje para cada fallo del proveedor de IA (los mensajes de LlmError son seguros de mostrar).
const ESTADO_LLM = { no_configurado: 503, limite: 429, timeout: 504, proveedor: 502, respuesta_invalida: 502 };

class CartaFotoController {
    // POST /productos/importar-carta/analizar   (multipart, campo "imagen")
    static async analizar(req, res) {
        res.set('Cache-Control', 'no-store');
        try {
            if (!asistenteConfigurado()) {
                return res
                    .status(503)
                    .json({ error: 'La lectura de cartas no está disponible todavía en este servidor.' });
            }
            const resultado = await CartaFotoService.analizar(req.file?.buffer);
            res.json(resultado);
        } catch (error) {
            if (error instanceof LlmError) {
                console.error('Error del proveedor al leer la carta:', error.codigo);
                const cuerpo = { error: error.message, codigo: `CARTA_IA_${error.codigo.toUpperCase()}` };
                if (error.reintentarEnSegundos) {
                    cuerpo.reintentar_en_segundos = error.reintentarEnSegundos;
                }
                return res.status(ESTADO_LLM[error.codigo] || 502).json(cuerpo);
            }
            console.error('Error al analizar la carta:', error.message);
            responderError(res, error, 'No se pudo leer la carta. Intenta de nuevo.');
        }
    }

    // POST /productos/importar-carta/confirmar   { items: [{nombre, categoria, descripcion, precio}] }
    static async confirmar(req, res) {
        try {
            const resultado = await CartaFotoService.confirmar(req.tenant.id, req.body?.items, req.user?.id);
            res.json(resultado);
        } catch (error) {
            console.error('Error al importar la carta:', error.message);
            responderError(res, error, 'No se pudo importar la carta. Intenta de nuevo.');
        }
    }
}

module.exports = CartaFotoController;
