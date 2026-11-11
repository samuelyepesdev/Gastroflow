/**
 * Normalización de texto dictado: minúsculas, sin tildes ni signos, y números dichos con palabras
 * convertidos en dígitos. Base común del matching de mesas y productos.
 */

const UNIDADES = {
    cero: 0,
    uno: 1,
    un: 1,
    una: 1,
    dos: 2,
    tres: 3,
    cuatro: 4,
    cinco: 5,
    seis: 6,
    siete: 7,
    ocho: 8,
    nueve: 9,
    diez: 10,
    once: 11,
    doce: 12,
    trece: 13,
    catorce: 14,
    quince: 15,
    dieciseis: 16,
    diecisiete: 17,
    dieciocho: 18,
    diecinueve: 19,
    veinte: 20,
    veintiuno: 21,
    veintiun: 21,
    veintiuna: 21,
    veintidos: 22,
    veintitres: 23,
    veinticuatro: 24,
    veinticinco: 25,
    veintiseis: 26,
    veintisiete: 27,
    veintiocho: 28,
    veintinueve: 29
};
const ARTICULOS_NUMERICOS = new Set(['uno', 'un', 'una']);
const DECENAS = {
    treinta: 30,
    cuarenta: 40,
    cincuenta: 50,
    sesenta: 60,
    setenta: 70,
    ochenta: 80,
    noventa: 90
};

const MAX_CANDIDATAS = 5;

/** minúsculas, sin tildes ni signos, espacios colapsados. */
function normalizar(texto) {
    return String(texto ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

/** Convierte números dichos con palabras (0-99) en dígitos: "mesa treinta y uno" -> "mesa 31". */
function palabrasANumeros(texto, { incluirArticulos = true } = {}) {
    const tokens = String(texto ?? '')
        .split(' ')
        .filter(Boolean);
    const salida = [];
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const unidad = UNIDADES[t];
        const esUnidadValida = unidad !== undefined && (incluirArticulos || !ARTICULOS_NUMERICOS.has(t));
        if (DECENAS[t] !== undefined) {
            const sigue = tokens[i + 1] === 'y' ? UNIDADES[tokens[i + 2]] : undefined;
            if (sigue !== undefined && sigue >= 1 && sigue <= 9) {
                salida.push(String(DECENAS[t] + sigue));
                i += 2;
            } else {
                salida.push(String(DECENAS[t]));
            }
        } else if (esUnidadValida) {
            salida.push(String(unidad));
        } else {
            salida.push(t);
        }
    }
    return salida.join(' ');
}

/** Singular simple: "ramens" -> "ramen". */
function singular(token) {
    return token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token;
}

/** Acota la lista de candidatas que se le muestra al usuario. */
function limitar(lista) {
    return lista.slice(0, MAX_CANDIDATAS);
}

module.exports = { normalizar, palabrasANumeros, singular, limitar };
