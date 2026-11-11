const AsistenteService = require('../../../../services/Tenant/Asistente/AsistenteService');
const auditoria = require('../../../../services/Tenant/Asistente/auditoria');
const TranscripcionService = require('../../../../services/Tenant/Asistente/TranscripcionService');
const AsistenteRepository = require('../../../../repositories/Tenant/AsistenteRepository');

// Código de error del servicio -> estado HTTP. Lo no listado es un fallo interno.
const ESTADOS = {
    sesion: 401,
    permisos: 403,
    solicitud: 400,
    formato: 415,
    confirmacion_invalida: 400,
    ejecucion: 400,
    iteraciones: 422,
    limite: 429,
    no_configurado: 503,
    timeout: 504,
    proveedor: 502,
    respuesta_invalida: 502,
    interno: 500
};

/** El contexto sale SIEMPRE de la sesión autenticada, nunca del cuerpo de la petición. */
function contextoDe(req, res) {
    return {
        tenantId: req.tenant.id,
        userId: req.user.id,
        permisos: req.user.permisos || [],
        allowedByPlan: res.locals.allowedByPlan || {}
    };
}

/** Solo lo que el cliente necesita: sin `meta` (auditoría interna). */
function responder(res, r) {
    const cuerpo = { tipo: r.tipo, texto: r.texto };
    if (r.confirmationId) {
        cuerpo.confirmationId = r.confirmationId;
        cuerpo.expiraEnSegundos = r.expiraEnSegundos;
    }
    if (r.tipo === 'error') {
        cuerpo.codigo = r.codigo;
        return res.status(ESTADOS[r.codigo] ?? 500).json(cuerpo);
    }
    return res.status(200).json(cuerpo);
}

function falloInterno(res, e) {
    // eslint-disable-next-line no-console
    console.error('[asistente] error en el controlador:', e?.name, e?.message);
    return res.status(500).json({ tipo: 'error', codigo: 'interno', texto: 'No pude procesar tu comando.' });
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
