const AsistenteSistemaService = require('../../../../services/Admin/AsistenteSistema/AsistenteSistemaService');
const TranscripcionService = require('../../../../services/Tenant/Asistente/TranscripcionService');
const auditoria = require('../../../../services/Tenant/Asistente/auditoria');
const { responder, falloInterno } = require('../asistenteHttp');

const NOMBRE = 'Asistente del sistema';

/** El superadmin no pertenece a ningún restaurante: el contexto es solo su usuario, tomado de la sesión. */
const contextoDe = req => ({ userId: req.user.id });
const contextoAuditoria = req => ({ tenantId: null, userId: req.user.id });

class AsistenteSistemaController {
    // GET /admin/asistente/api/chat/estado
    static estado(req, res) {
        res.json({ nombre: NOMBRE });
    }

    // POST /admin/asistente/api/chat/comando
    static async comando(req, res) {
        try {
            const { texto, historial } = req.body || {};
            const resultado = await AsistenteSistemaService.comando(contextoDe(req), { texto, historial });
            await auditoria.registrar(contextoAuditoria(req), 'asistente.admin_consulta', resultado, { texto });
            return responder(res, resultado);
        } catch (e) {
            return falloInterno(res, e);
        }
    }

    // POST /admin/asistente/api/chat/transcribir: cuerpo = audio crudo; solo devuelve el texto.
    static async transcribir(req, res) {
        try {
            const resultado = await TranscripcionService.transcribir({
                audio: req.body,
                tipo: req.headers['content-type']
            });
            await auditoria.registrar(contextoAuditoria(req), 'asistente.admin_transcribir', resultado, {
                bytes: resultado.meta?.bytes ?? null
            });
            return responder(res, resultado);
        } catch (e) {
            return falloInterno(res, e);
        }
    }
}

module.exports = AsistenteSistemaController;
