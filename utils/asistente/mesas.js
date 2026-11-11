const { normalizar, palabrasANumeros, singular, limitar } = require('./normalizacion');

// Palabras que no ayudan a identificar una mesa ("la mesa de domicilio" -> "domicilio").
const RELLENO_MESA = new Set([
    'mesa',
    'mesas',
    'numero',
    'nro',
    'no',
    'la',
    'el',
    'de',
    'del',
    'en',
    'para',
    'a',
    'al'
]);

const SIN_COINCIDENCIA = { estado: 'sin_coincidencia', candidatas: [] };

function tokensMesa(texto) {
    const todos = palabrasANumeros(normalizar(texto)).split(' ').filter(Boolean);
    const utiles = todos.filter(t => !RELLENO_MESA.has(t));
    return utiles.length > 0 ? utiles : todos;
}

function resultado(encontradas) {
    if (encontradas.length === 1) {
        return { estado: 'ok', mesa: encontradas[0] };
    }
    return { estado: 'ambigua', candidatas: limitar(encontradas) };
}

/** Número exacto ("4" no es "14"; "t 1" es "T1"). */
const porNumero = (mesas, compacta) => mesas.filter(m => tokensMesa(m.numero).join('') === compacta);

/** Descripción exacta ("Barra", "terraza dos"). */
const porDescripcion = (mesas, compacta) =>
    mesas.filter(m => m.descripcion && tokensMesa(m.descripcion).join('') === compacta);

/** "Domicilio" apunta a las mesas virtuales (migración 037). */
function porDomicilio(mesas, consulta) {
    return consulta.some(t => t.startsWith('domicilio')) ? mesas.filter(m => m.tipo === 'virtual') : [];
}

/**
 * Todas las palabras dichas aparecen en la descripción ("la terraza" -> Terraza 1 y 2).
 * Un texto solo numérico nunca se busca aquí: "1" no debe caer en "Terraza 1".
 */
function porPalabras(mesas, consulta) {
    if (!consulta.some(t => /[a-z]/.test(t))) {
        return [];
    }
    const dichas = consulta.map(singular);
    return mesas.filter(m => {
        if (!m.descripcion) {
            return false;
        }
        const enDescripcion = tokensMesa(m.descripcion).map(singular);
        return dichas.every(t => enDescripcion.includes(t));
    });
}

/**
 * @param {string} texto - Lo que dijo el usuario ("mesa cuatro", "la terraza", "domicilio").
 * @param {Array<{id:number, numero:string, descripcion?:string, tipo?:string}>} mesas - Mesas del tenant.
 * @returns {{estado:'ok', mesa:Object}|{estado:'ambigua', candidatas:Object[]}|{estado:'sin_coincidencia', candidatas:[]}}
 */
function resolverMesa(texto, mesas) {
    const consulta = tokensMesa(texto);
    if (consulta.length === 0 || !Array.isArray(mesas)) {
        return SIN_COINCIDENCIA;
    }
    const compacta = consulta.join('');
    const estrategias = [
        () => porNumero(mesas, compacta),
        () => porDescripcion(mesas, compacta),
        () => porDomicilio(mesas, consulta),
        () => porPalabras(mesas, consulta)
    ];
    for (const buscar of estrategias) {
        const encontradas = buscar();
        if (encontradas.length > 0) {
            return resultado(encontradas);
        }
    }
    return SIN_COINCIDENCIA;
}

module.exports = { resolverMesa };
