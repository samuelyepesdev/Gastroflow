const { hoyColombia, sumarDias, sumarMeses } = require('../../../utils/dateHelpers');
const { AclaracionError } = require('../../Tenant/Asistente/tools/errores');

const INICIO_HISTORICO = '2000-01-01';
const MAX_DIAS_PERSONALIZADO = 400;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MES_PASADO = 'mes_pasado';

const PERIODOS = ['hoy', 'ayer', 'ultimos_7_dias', 'este_mes', MES_PASADO, 'este_anio', 'historico'];

const primerDiaDelMes = dia => `${dia.slice(0, 7)}-01`;
const ultimoDiaDelMes = dia => sumarDias(sumarMeses(primerDiaDelMes(dia), 1), -1);

/** Días del rango, ambos extremos incluidos. */
const diasEntre = (desde, hasta) =>
    Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86400000) + 1;

function fechaValida(texto) {
    if (typeof texto !== 'string' || !FECHA.test(texto)) {
        return false;
    }
    if (Number.isNaN(Date.parse(`${texto}T12:00:00Z`))) {
        return false; // mes 13, día 00...
    }
    // Ida y vuelta: rechaza días que no existen (2026-02-30) sin depender del motor de fechas.
    return sumarDias(texto, 0) === texto;
}

const aclarar = mensaje => {
    throw new AclaracionError(mensaje);
};

/** Rango pedido por el usuario con fechas. */
function personalizado(desde, hasta, hoy) {
    if (!fechaValida(desde) || (hasta !== undefined && hasta !== null && !fechaValida(hasta))) {
        aclarar('Las fechas deben tener el formato AAAA-MM-DD, por ejemplo 2026-11-01.');
    }
    const fin = !hasta || hasta > hoy ? hoy : hasta;
    if (desde > fin) {
        aclarar('La fecha de inicio no puede ser posterior a la de fin.');
    }
    if (diasEntre(desde, fin) > MAX_DIAS_PERSONALIZADO) {
        aclarar(`El rango no puede pasar de ${MAX_DIAS_PERSONALIZADO} días. Usa "historico" para ver todo.`);
    }
    return { desde, hasta: fin, etiqueta: `${desde} a ${fin}`, porMeses: false };
}

function nombrado(periodo, hoy) {
    switch (periodo) {
        case 'hoy':
            return { desde: hoy, hasta: hoy, etiqueta: `hoy (${hoy})`, porMeses: false };
        case 'ayer': {
            const ayer = sumarDias(hoy, -1);
            return { desde: ayer, hasta: ayer, etiqueta: `ayer (${ayer})`, porMeses: false };
        }
        case 'ultimos_7_dias':
            return { desde: sumarDias(hoy, -6), hasta: hoy, etiqueta: 'los últimos 7 días', porMeses: false };
        case 'este_mes':
            return { desde: primerDiaDelMes(hoy), hasta: hoy, etiqueta: 'este mes', porMeses: true };
        case MES_PASADO: {
            const base = sumarMeses(primerDiaDelMes(hoy), -1);
            return { desde: base, hasta: ultimoDiaDelMes(base), etiqueta: 'el mes pasado', porMeses: true };
        }
        case 'este_anio':
            return { desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy, etiqueta: 'este año', porMeses: true };
        default:
            return {
                desde: INICIO_HISTORICO,
                hasta: hoy,
                etiqueta: 'todo el histórico',
                porMeses: false,
                sinAnterior: true
            };
    }
}

/** Mismo tramo del periodo anterior: un mes atrás para periodos de calendario, o igual duración inmediatamente antes. */
function anteriorDe(p) {
    if (p.sinAnterior) {
        return null;
    }
    if (p.porMeses) {
        const meses = p.etiqueta === 'este año' ? -12 : -1;
        const desde = sumarMeses(p.desde, meses);
        // Un mes completo (día 1 al último) se compara con el mes completo anterior.
        const completo = p.desde.endsWith('-01') && p.hasta === ultimoDiaDelMes(p.hasta);
        return { desde, hasta: completo ? ultimoDiaDelMes(desde) : sumarMeses(p.hasta, meses) };
    }
    const n = diasEntre(p.desde, p.hasta);
    return { desde: sumarDias(p.desde, -n), hasta: sumarDias(p.desde, -1) };
}

/**
 * Traduce lo que pidió el modelo a un rango de fechas en hora de Colombia, validado en el servidor.
 * El modelo solo manda un nombre de periodo o dos fechas; nunca SQL.
 *
 * @param {{periodo?: string, desde?: string, hasta?: string}} [args]
 * @param {string} [hoy] 'YYYY-MM-DD' (solo para tests)
 * @returns {{desde:string, hasta:string, etiqueta:string, anterior:{desde:string,hasta:string}|null}}
 */
function resolverPeriodo(args, hoy = hoyColombia()) {
    const { periodo, desde, hasta } = args || {};
    let p;
    if (desde !== undefined || hasta !== undefined) {
        if (desde === undefined || desde === null) {
            aclarar('Dime desde qué fecha quieres ver (AAAA-MM-DD).');
        }
        p = personalizado(desde, hasta, hoy);
    } else if (periodo === undefined || periodo === null) {
        p = nombrado('hoy', hoy);
    } else if (typeof periodo === 'string' && PERIODOS.includes(periodo)) {
        p = nombrado(periodo, hoy);
    } else {
        return aclarar(`Periodo no válido. Usa uno de: ${PERIODOS.join(', ')}, o dos fechas AAAA-MM-DD.`);
    }
    const etiqueta =
        p.etiqueta.includes(p.desde) || p.desde === INICIO_HISTORICO
            ? p.etiqueta
            : `${p.etiqueta} (${p.desde} a ${p.hasta})`;
    return { desde: p.desde, hasta: p.hasta, etiqueta, anterior: anteriorDe(p) };
}

module.exports = { resolverPeriodo, PERIODOS };
