const { normalizar, palabrasANumeros, singular, limitar } = require('./normalizacion');

// Palabras vacías al buscar un producto ("la limonada" -> "limonada").
const RELLENO_PRODUCTO = new Set([
    'de',
    'del',
    'la',
    'el',
    'las',
    'los',
    'un',
    'una',
    'unos',
    'unas',
    'con',
    'y',
    'al'
]);

function tokensProducto(texto) {
    return palabrasANumeros(normalizar(texto), { incluirArticulos: false }).split(' ').filter(Boolean).map(singular);
}

function distanciaEdicion(a, b) {
    if (a === b) {
        return 0;
    }
    let anterior = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        const actual = [i];
        for (let j = 1; j <= b.length; j++) {
            const costo = a[i - 1] === b[j - 1] ? 0 : 1;
            actual[j] = Math.min(anterior[j] + 1, actual[j - 1] + 1, anterior[j - 1] + costo);
        }
        anterior = actual;
    }
    return anterior[b.length];
}

/** Nombre exacto, o todas las palabras dichas contenidas en el nombre. */
function resolverDirecto(consulta, productos) {
    const clave = consulta.join(' ');
    const exactos = productos.filter(p => tokensProducto(p.nombre).join(' ') === clave);
    if (exactos.length > 0) {
        return exactos;
    }
    const utiles = consulta.filter(t => !RELLENO_PRODUCTO.has(t));
    if (utiles.length === 0) {
        return [];
    }
    return productos.filter(p => {
        const nombre = tokensProducto(p.nombre);
        return utiles.every(t => nombre.includes(t));
    });
}

/** Tolera errores pequeños de transcripción ("ramem" -> "ramen"): gana la menor distancia, si es única. */
function resolverAproximado(consulta, productos) {
    const clave = consulta.join('');
    let mejor = Infinity;
    let ganadores = [];
    for (const p of productos) {
        const nombre = tokensProducto(p.nombre).join('');
        const tolerancia = nombre.length >= 4 ? Math.min(2, Math.floor(nombre.length / 4)) : 0;
        const d = distanciaEdicion(clave, nombre);
        if (d > tolerancia) {
            continue;
        }
        if (d < mejor) {
            mejor = d;
            ganadores = [p];
        } else if (d === mejor) {
            ganadores.push(p);
        }
    }
    return ganadores;
}

/**
 * Resuelve el producto dictado. Prefiere productos disponibles; si el texto solo coincide con uno no
 * disponible lo informa como tal en vez de decir que no existe.
 * @param {string} texto
 * @param {Array<{id:number, nombre:string, disponible?:number|boolean}>} productos - Productos activos del tenant.
 */
function resolverProducto(texto, productos) {
    const consulta = tokensProducto(texto);
    if (consulta.length === 0 || !Array.isArray(productos)) {
        return { estado: 'sin_coincidencia', candidatas: [] };
    }
    const disponibles = productos.filter(p => p.disponible);
    const noDisponibles = productos.filter(p => !p.disponible);

    const intentos = [
        { lista: disponibles, fn: resolverDirecto, aproximada: false, estadoUnico: 'ok' },
        { lista: noDisponibles, fn: resolverDirecto, aproximada: false, estadoUnico: 'no_disponible' },
        { lista: disponibles, fn: resolverAproximado, aproximada: true, estadoUnico: 'ok' },
        { lista: noDisponibles, fn: resolverAproximado, aproximada: true, estadoUnico: 'no_disponible' }
    ];

    for (const { lista, fn, aproximada, estadoUnico } of intentos) {
        const encontrados = fn(consulta, lista);
        if (encontrados.length === 1) {
            const r = { estado: estadoUnico, producto: encontrados[0] };
            if (aproximada) {
                r.aproximada = true;
            }
            return r;
        }
        if (encontrados.length > 1) {
            return { estado: estadoUnico === 'ok' ? 'ambigua' : 'no_disponible', candidatas: limitar(encontrados) };
        }
    }
    return { estado: 'sin_coincidencia', candidatas: [] };
}

module.exports = { resolverProducto };
