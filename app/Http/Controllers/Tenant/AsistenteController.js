const AsistenteService = require('../../../../services/Tenant/Asistente/AsistenteService');
const auditoria = require('../../../../services/Tenant/Asistente/auditoria');
const TranscripcionService = require('../../../../services/Tenant/Asistente/TranscripcionService');
const { responder, falloInterno } = require('../asistenteHttp');
const AsistenteRepository = require('../../../../repositories/Tenant/AsistenteRepository');

/** El contexto sale SIEMPRE de la sesión autenticada, nunca del cuerpo de la petición. */
function contextoDe(req, res) {
    return {
        tenantId: req.tenant.id,
        userId: req.user.id,
        permisos: req.user.permisos || [],
        allowedByPlan: res.locals.allowedByPlan || {}
    };
}

class AsistenteController {
    // GET /api/asistente/estado: lo que el panel necesita para presentarse (hoy, solo el nombre).
    static async estado(req, res) {
        try {
            const nombre = await AsistenteRepository.nombreAsistente(req.tenant.id);
            return res.json({ nombre: nombre || 'Chef' });
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error('[asistente] error leyendo el estado:', e?.name, e?.message);
            return res.json({ nombre: 'Chef' });
        }
    }

    // POST /api/asistente/transcribir: cuerpo = audio crudo. Solo devuelve el texto; el comando lo envía el cliente.
    static async transcribir(req, res) {
        try {
            const ctx = contextoDe(req, res);
            const resultado = await TranscripcionService.transcribir({
                audio: req.body,
                tipo: req.headers['content-type']
            });
            await auditoria.registrar(ctx, 'asistente.transcribir', resultado, {
                bytes: resultado.meta?.bytes ?? null
            });
            return responder(res, resultado);
        } catch (e) {
            return falloInterno(res, e);
        }
    }

    // POST /api/asistente/comando
    static async comando(req, res) {
        try {
            const ctx = contextoDe(req, res);
            const { texto, historial } = req.body || {};
            const resultado = await AsistenteService.comando(ctx, { texto, historial });
            await auditoria.registrar(ctx, 'asistente.comando', resultado, { texto });
            return responder(res, resultado);
        } catch (e) {
            return falloInterno(res, e);
        }
    }

    // POST /api/asistente/confirmar
    static async confirmar(req, res) {
        try {
            const ctx = contextoDe(req, res);
            const { confirmationId, aceptar } = req.body || {};
            const resultado = await AsistenteService.confirmar(ctx, { confirmationId, aceptar });
            await auditoria.registrar(ctx, 'asistente.confirmar', resultado, { aceptar: aceptar === true });
            return responder(res, resultado);
        } catch (e) {
            return falloInterno(res, e);
        }
    }
}

module.exports = AsistenteController;
