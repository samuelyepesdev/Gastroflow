/**
 * ResenaService - Reseñas de clientes con página pública por token.
 *
 * Regla de honestidad: el enlace a Google se ofrece a TODOS los clientes, sea cual sea su calificación.
 * Las calificaciones bajas solo reciben, además, una invitación a contarle al restaurante qué pasó.
 * No se esconde ni se condiciona el enlace: Google prohíbe pedir reseñas solo a los clientes satisfechos.
 */
const crypto = require('crypto');
const ResenaRepository = require('../../repositories/Tenant/ResenaRepository');
const { normalizarTelefono } = require('./ReservaService');
const { hoyColombia, sumarDias, rangoUtcColombia } = require('../../utils/dateHelpers');
const { ValidationError, NotFoundError } = require('../../utils/errors');

const nuevoToken = () => crypto.randomBytes(18).toString('hex');

const DIAS_RESUMEN = 30;
const UMBRAL_BAJA = 3;
const HOSTS_GOOGLE = ['google.com', 'g.page', 'goo.gl'];

/** Solo https hacia dominios de Google (la reseña se deja en Google Maps). Devuelve la URL limpia o null. */
function validarGoogleUrl(valor) {
    const texto = String(valor ?? '').trim();
    if (!texto) {
        return null;
    }
    let url;
    try {
        url = new URL(texto);
    } catch {
        throw new ValidationError('El enlace de Google no es válido', 'RESENA_GOOGLE_URL_INVALIDA');
    }
    const host = url.hostname.toLowerCase();
    const esGoogle = HOSTS_GOOGLE.some(h => host === h || host.endsWith(`.${h}`));
    if (url.protocol !== 'https:' || !esGoogle || texto.length > 500) {
        throw new ValidationError(
            'Pega el enlace de reseñas de Google (debe empezar por https:// y ser de Google)',
            'RESENA_GOOGLE_URL_INVALIDA'
        );
    }
    return url.toString();
}

const textoOpcional = (valor, max, campo) => {
    const t = String(valor ?? '').trim();
    if (t.length > max) {
        throw new ValidationError(`${campo} no puede superar ${max} caracteres`, 'RESENA_TEXTO_LARGO');
    }
    return t || null;
};

/** Calcula promedio, total y distribución a partir del conteo por estrella. */
function armarResumen(porEstrella) {
    const distribucion = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const f of porEstrella) {
        distribucion[Number(f.calificacion)] = Number(f.total);
    }
    const total = Object.values(distribucion).reduce((a, b) => a + b, 0);
    const suma = Object.entries(distribucion).reduce((a, [estrellas, n]) => a + Number(estrellas) * n, 0);
    return { total, promedio: total ? Math.round((suma / total) * 10) / 10 : null, distribucion };
}

class ResenaService {
    // ------------------------------------------------------------------ restaurante

    static async getConfig(tenantId) {
        return (
            (await ResenaRepository.getConfig(tenantId)) ||
            (await ResenaRepository.asegurarConfig(tenantId, nuevoToken()))
        );
    }

    static async guardarConfig(tenantId, body = {}) {
        await ResenaService.getConfig(tenantId);
        await ResenaRepository.actualizarConfig(tenantId, {
            activo: body.activo === true || body.activo === '1' || body.activo === 1,
            google_url: validarGoogleUrl(body.google_url),
            mensaje_gracias: textoOpcional(body.mensaje_gracias, 200, 'El mensaje de agradecimiento')
        });
        return ResenaService.getConfig(tenantId);
    }

    static async regenerarEnlace(tenantId) {
        await ResenaService.getConfig(tenantId);
        await ResenaRepository.setToken(tenantId, nuevoToken());
        return ResenaService.getConfig(tenantId);
    }

    static async listar(tenantId, { estado, soloBajas } = {}) {
        const estadoValido = ['nueva', 'atendida'].includes(estado) ? estado : null;
        return ResenaRepository.listar(tenantId, {
            estado: estadoValido,
            soloBajas: soloBajas === true || soloBajas === '1'
        });
    }

    /** Resumen de los últimos 30 días (hora Colombia) más las bajas que aún nadie atendió. */
    static async resumen(tenantId, hoy = hoyColombia()) {
        const { utcDesde } = rangoUtcColombia(sumarDias(hoy, -(DIAS_RESUMEN - 1)), hoy);
        const { porEstrella, bajasPendientes } = await ResenaRepository.resumen(tenantId, utcDesde);
        return { dias: DIAS_RESUMEN, ...armarResumen(porEstrella), bajas_pendientes: Number(bajasPendientes) };
    }

    static async marcarAtendida(tenantId, id, atendida) {
        const ok = await ResenaRepository.setEstado(tenantId, Number(id), atendida ? 'atendida' : 'nueva');
        if (!ok) {
            throw new NotFoundError('Reseña no encontrada', 'RESENA_NO_ENCONTRADA');
        }
    }

    // ------------------------------------------------------------------ página pública

    /** Datos que puede ver un cliente anónimo. Devuelve null si el enlace no existe o está apagado. */
    static async vistaPublica(token) {
        const c = await ResenaRepository.getConfigPorToken(String(token || ''));
        if (!c) {
            return null;
        }
        return {
            restaurante: c.restaurante,
            google_url: c.google_url || null,
            mensaje_gracias: c.mensaje_gracias || null
        };
    }

    /** Guarda la reseña de un cliente. El restaurante se resuelve por token, nunca por el cuerpo. */
    static async crearPublica(token, body = {}, ip = null, ahora = new Date()) {
        const config = await ResenaRepository.getConfigPorToken(String(token || ''));
        if (!config) {
            throw new NotFoundError('Esta página no está disponible', 'RESENA_NO_DISPONIBLE');
        }

        const texto = String(body.calificacion ?? '').trim();
        const calificacion = /^[1-5]$/.test(texto) ? Number(texto) : NaN;
        if (!Number.isInteger(calificacion)) {
            throw new ValidationError('Elige de 1 a 5 estrellas', 'RESENA_CALIFICACION_INVALIDA');
        }

        const comentario = textoOpcional(body.comentario, 500, 'El comentario');
        const nombre = textoOpcional(body.nombre, 80, 'El nombre');
        let telefono = null;
        let conConsentimiento = false;
        if (String(body.telefono ?? '').trim()) {
            telefono = normalizarTelefono(body.telefono);
            if (!telefono) {
                throw new ValidationError(
                    'Escribe un celular colombiano válido de 10 dígitos',
                    'RESENA_TELEFONO_INVALIDO'
                );
            }
            if (body.consentimiento !== true && body.consentimiento !== '1') {
                throw new ValidationError(
                    'Debes autorizar el uso de tu celular para que el restaurante te contacte',
                    'RESENA_SIN_CONSENTIMIENTO'
                );
            }
            conConsentimiento = true;
        }

        await ResenaRepository.crear(config.tenant_id, {
            calificacion,
            comentario,
            nombre,
            telefono,
            consentimiento_at: conConsentimiento ? ahora : null,
            consentimiento_ip: conConsentimiento ? String(ip || '').slice(0, 45) || null : null
        });
        return { calificacion, baja: calificacion <= UMBRAL_BAJA };
    }
}

module.exports = ResenaService;
module.exports.validarGoogleUrl = validarGoogleUrl;
module.exports.armarResumen = armarResumen;
module.exports.UMBRAL_BAJA = UMBRAL_BAJA;
