/**
 * TemaTemporadaService - Tema visual de temporada (hoy: Navidad) para las páginas públicas del restaurante
 * (reservas y menú QR). Lo puede activar el restaurante, el superadmin para todos, o el superadmin para uno solo.
 *
 * Prioridad: la decisión explícita del restaurante (activo = 1 o 0 en `tema_temporada`) prevalece sobre lo
 * global; si el restaurante no ha decidido (activo NULL o sin fila), hereda lo global. Las fechas y el mensaje
 * del restaurante, si los tiene, se usan; si no, los del global. Nunca rompe la página: si algo falla, se ve sin tema.
 */
const TemaTemporadaRepository = require('../../repositories/Tenant/TemaTemporadaRepository');
const { ValidationError, NotFoundError } = require('../../utils/errors');
const { hoyColombia, toFechaDia } = require('../../utils/dateHelpers');

const TEMAS = ['navidad'];
const ESTADOS = { heredar: null, activado: 1, apagado: 0 };
const SI = v => v === true || v === 1 || v === '1' || v === 'true';

/** ¿La ventana [desde, hasta] (ambas opcionales, inclusive) contiene `hoy`? */
function enVentana(desde, hasta, hoy) {
    return (!desde || desde <= hoy) && (!hasta || hasta >= hoy);
}

const decidio = fila => !!fila && fila.activo !== null && fila.activo !== undefined;

/**
 * Combina la decisión del restaurante con lo global.
 * @returns {{activo: boolean, origen: 'restaurante'|'global'|null, tema: string, desde: string|null,
 *            hasta: string|null, mensaje: string, animaciones: boolean}}
 */
function resolver(fila, global) {
    let activo = false;
    let origen = null;
    if (decidio(fila)) {
        activo = !!fila.activo;
        origen = 'restaurante';
    } else if (global && global.activo) {
        activo = true;
        origen = 'global';
    }
    // Animaciones: si cualquiera de los dos las apaga, quedan apagadas.
    const quietoGlobal = global ? !global.animaciones : false;
    const quietoFila = fila ? !fila.animaciones : false;
    return {
        activo,
        origen,
        tema: fila?.tema || global?.tema || 'navidad',
        desde: fila?.desde || global?.desde || null,
        hasta: fila?.hasta || global?.hasta || null,
        mensaje: fila?.mensaje || global?.mensaje || '',
        animaciones: !(quietoGlobal || quietoFila)
    };
}

/** Valida y normaliza lo que llega de un formulario (restaurante o global). */
function normalizar(body) {
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
    return {
        tema,
        activo: SI(body.activo) ? 1 : 0,
        desde,
        hasta,
        mensaje: mensaje || null,
        animaciones: body.animaciones === undefined ? 1 : SI(body.animaciones) ? 1 : 0
    };
}

class TemaTemporadaService {
    // ------------------------------------------------------------------ restaurante

    /** Configuración para el panel del restaurante (con valores por defecto y datos de lo heredado). */
    static async getConfig(tenantId) {
        const [fila, global] = await Promise.all([
            TemaTemporadaRepository.get(tenantId),
            TemaTemporadaRepository.getGlobal()
        ]);
        const r = resolver(fila, global);
        return {
            tema: r.tema,
            activo: r.activo,
            // `hereda`: el restaurante no ha decidido y lo está activando GastroFlow para todos.
            hereda: !decidio(fila) && !!global?.activo,
            desde: fila?.desde || '',
            hasta: fila?.hasta || '',
            mensaje: fila?.mensaje || '',
            animaciones: fila ? !!fila.animaciones : true,
            global: global?.activo
                ? { desde: global.desde || '', hasta: global.hasta || '', mensaje: global.mensaje || '' }
                : null
        };
    }

    static ventanaSugerida(hoy = hoyColombia()) {
        const anio = Number(hoy.slice(0, 4));
        // Del 1 al 6 de enero todavía estamos dentro de la temporada del año anterior.
        const base = hoy.slice(5) <= '01-06' ? anio - 1 : anio;
        return { desde: `${base}-12-01`, hasta: `${base + 1}-01-06` };
    }

    /** Guarda la decisión del restaurante: queda explícita (1 o 0) y prevalece sobre lo global. */
    static async guardar(tenantId, body = {}) {
        await TemaTemporadaRepository.upsert(tenantId, normalizar(body));
        return TemaTemporadaService.getConfig(tenantId);
    }

    /**
     * Tema que debe verse hoy en las páginas públicas, o null. Nunca lanza.
     * @returns {Promise<{tema: string, mensaje: string, animaciones: boolean}|null>}
     */
    static async getActivo(tenantId, hoy = hoyColombia()) {
        try {
            const [fila, global] = await Promise.all([
                TemaTemporadaRepository.get(tenantId),
                TemaTemporadaRepository.getGlobal()
            ]);
            const r = resolver(fila, global);
            if (!r.activo || !enVentana(r.desde, r.hasta, hoy)) {
                return null;
            }
            return { tema: r.tema, mensaje: r.mensaje, animaciones: r.animaciones };
        } catch (error) {
            console.error('Error al leer el tema de temporada:', error.message);
            return null;
        }
    }

    // ------------------------------------------------------------------ superadmin

    static async getGlobal() {
        const g = await TemaTemporadaRepository.getGlobal();
        return {
            tema: g?.tema || 'navidad',
            activo: !!g?.activo,
            desde: g?.desde || '',
            hasta: g?.hasta || '',
            mensaje: g?.mensaje || '',
            animaciones: g ? !!g.animaciones : true
        };
    }

    /** Activa o apaga el look para todos los restaurantes que no hayan decidido por su cuenta. */
    static async guardarGlobal(body = {}) {
        await TemaTemporadaRepository.upsertGlobal(normalizar(body));
        return TemaTemporadaService.getGlobal();
    }

    /** Restaurantes con su estado (hereda / activado / apagado) y si el tema se ve hoy. */
    static async listarRestaurantes(hoy = hoyColombia()) {
        const [filas, global] = await Promise.all([
            TemaTemporadaRepository.listarRestaurantes(),
            TemaTemporadaRepository.getGlobal()
        ]);
        return filas.map(f => {
            const fila = f.tiene_fila ? f : null;
            const r = resolver(fila, global);
            return {
                id: f.id,
                nombre: f.nombre,
                slug: f.slug,
                estado: !decidio(fila) ? 'heredar' : fila.activo ? 'activado' : 'apagado',
                visible: r.activo && enVentana(r.desde, r.hasta, hoy)
            };
        });
    }

    /** Fuerza el estado de un restaurante: 'heredar' (sigue lo global), 'activado' o 'apagado'. */
    static async setEstadoRestaurante(tenantId, estado) {
        if (!(estado in ESTADOS)) {
            throw new ValidationError('Estado no válido', 'TEMA_ESTADO_INVALIDO');
        }
        const id = Number.parseInt(tenantId, 10);
        if (!Number.isInteger(id) || !(await TemaTemporadaRepository.tenantExiste(id))) {
            throw new NotFoundError('Restaurante no encontrado', 'TEMA_RESTAURANTE_NO_ENCONTRADO');
        }
        await TemaTemporadaRepository.setDecision(id, ESTADOS[estado]);
        return { id, estado };
    }
}

module.exports = TemaTemporadaService;
module.exports.enVentana = enVentana;
module.exports.resolver = resolver;
