const { ToolError } = require('./errores');

/** Una sola línea, sin caracteres de control y con largo acotado (el texto puede venir de un cliente QR). */
function limpiar(valor, max) {
    return String(valor ?? '')
        .replace(/[\u0000-\u001f\u007f]+/g, ' ') // eslint-disable-line no-control-regex -- justamente se eliminan
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max);
}

/** Texto obligatorio, limpio y acotado. */
function texto(valor, campo, max) {
    const t = typeof valor === 'string' ? limpiar(valor, max) : '';
    if (!t) {
        throw new ToolError(`Falta ${campo}.`);
    }
    return t;
}

/** Nota opcional: vacía -> null. */
function notaOpcional(valor, max) {
    return valor ? limpiar(valor, max) || null : null;
}

function entero(valor, campo, min, max) {
    const n =
        typeof valor === 'number' ? valor : typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : NaN;
    if (!Number.isInteger(n) || n < min || n > max) {
        throw new ToolError(`${campo} debe ser un número entero entre ${min} y ${max}.`);
    }
    return n;
}

/** Id que viene de una acción ya preparada: solo enteros positivos, jamás texto. */
function idEstricto(valor, campo) {
    if (!Number.isInteger(valor) || valor <= 0) {
        throw new ToolError(`Acción inválida (${campo}).`);
    }
    return valor;
}

module.exports = { limpiar, texto, notaOpcional, entero, idEstricto };
