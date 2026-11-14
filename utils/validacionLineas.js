/**
 * Validación numérica de líneas de venta/pedido que llegan del cliente. Un cantidad negativa o NaN
 * resta del total; un precio negativo o infinito rompe el cierre de caja. Solo valida forma y rango:
 * qué precio es el correcto lo sigue decidiendo cada servicio contra el catálogo.
 */

function error400(mensaje) {
    return Object.assign(new Error(mensaje), { status: 400, codigo: 'LINEA_INVALIDA' });
}

function aNumero(valor) {
    if (valor === null || valor === undefined || valor === '' || typeof valor === 'boolean') {
        return Number.NaN;
    }
    return Number(valor);
}

/** Cantidad: número finito mayor que 0 (admite decimales: kg, litros). Devuelve el número. */
function exigirCantidad(valor, etiqueta = 'La cantidad') {
    const n = aNumero(valor);
    if (!Number.isFinite(n) || n <= 0) {
        throw error400(`${etiqueta} debe ser un número mayor que 0`);
    }
    return n;
}

/** Dinero: número finito mayor o igual a 0. Devuelve el número. */
function exigirMonto(valor, etiqueta = 'El valor') {
    const n = aNumero(valor);
    if (!Number.isFinite(n) || n < 0) {
        throw error400(`${etiqueta} debe ser un número mayor o igual a 0`);
    }
    return n;
}

/** Valida cantidad (obligatoria) y precio/subtotal (si vienen) de cada línea. */
function validarLineas(lineas) {
    for (const l of lineas || []) {
        exigirCantidad(l.cantidad);
        if (l.precio !== undefined && l.precio !== null) {
            exigirMonto(l.precio, 'El precio');
        }
        if (l.subtotal !== undefined && l.subtotal !== null) {
            exigirMonto(l.subtotal, 'El subtotal');
        }
    }
}

module.exports = { exigirCantidad, exigirMonto, validarLineas };
