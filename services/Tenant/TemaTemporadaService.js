/**
 * TemaTemporadaService - Tema visual de temporada (hoy: Navidad) para las páginas públicas del restaurante
 * (reservas y menú QR). Es opcional por restaurante, con ventana de fechas, y nunca rompe la página: si algo
 * falla, la página se ve sin tema.
 */
const TemaTemporadaRepository = require('../../repositories/Tenant/TemaTemporadaRepository');
const { ValidationError } = require('../../utils/errors');
const { hoyColombia, toFechaDia } = require('../../utils/dateHelpers');

const TEMAS = ['navidad'];
const SI = v => v === true || v === 1 || v === '1' || v === 'true';

/** ¿La ventana [desde, hasta] (ambas opcionales, inclusive) contiene `hoy`? */
function enVentana(desde, hasta, hoy) {
    return (!desde || desde <= hoy) && (!hasta || hasta >= hoy);
}

class TemaTemporadaService {
    /** Configuración para el panel (con valores por defecto si el restaurante nunca la guardó). */
    static async getConfig(tenantId) {
        const c = await TemaTemporadaRepository.get(tenantId);
        return {
            tema: c?.tema || 'navidad',
            activo: !!c?.activo,
            desde: c?.desde || '',
            hasta: c?.hasta || '',
            mensaje: c?.mensaje || '',
            animaciones: c ? !!c.animaciones : true
        };
    }

    /** Ventana de fechas que se sugiere en el panel: del 1 de diciembre al 6 de enero (Reyes). */
    static ventanaSugerida(hoy = hoyColombia()) {
        const anio = Number(hoy.slice(0, 4));
        // Del 1 al 6 de enero todavía estamos dentro de la temporada del año anterior.
        const base = hoy.slice(5) <= '01-06' ? anio - 1 : anio;
        return { desde: `${base}-12-01`, hasta: `${base + 1}-01-06` };
    }

    static async guardar(tenantId, body = {}) {
        const tema = TEMAS.includes(body.tema) ? body.tema : 'navidad';
        const desde = body.desde ? toFechaDia(body.desde) : null;
        const hasta = body.hasta ? toFechaDia(body.hasta) : null;
        if (desde && hasta && hasta < desde) {
            throw new ValidationError('La fecha final no puede ser anterior a la inicial', 'TEMA_FECHAS_INVALIDAS');
        }
        const mensaje = String(body.mensaje ?? '').trim();
        if (mensaje.length > 160) {
            throw new ValidationError('El mensaje no puede superar 160 caracteres', 'TEMA_MENSAJE_LARGO');
        }
        await TemaTemporadaRepository.upsert(tenantId, {
            tema,
            activo: SI(body.activo) ? 1 : 0,
            desde,
            hasta,
            mensaje: mensaje || null,
            animaciones: body.animaciones === undefined ? 1 : SI(body.animaciones) ? 1 : 0
        });
        return TemaTemporadaService.getConfig(tenantId);
    }

    /**
     * Tema que debe verse hoy en las páginas públicas, o null. Nunca lanza: un fallo del tema no debe
     * tumbar el menú ni las reservas.
     * @returns {Promise<{tema: string, mensaje: string, animaciones: boolean}|null>}
     */
    static async getActivo(tenantId, hoy = hoyColombia()) {
        try {
            const c = await TemaTemporadaRepository.get(tenantId);
            if (!c || !c.activo || !enVentana(c.desde, c.hasta, hoy)) {
                return null;
            }
            return { tema: c.tema, mensaje: c.mensaje || '', animaciones: !!c.animaciones };
        } catch (error) {
            console.error('Error al leer el tema de temporada:', error.message);
            return null;
        }
    }
}

module.exports = TemaTemporadaService;
module.exports.enVentana = enVentana;
