/**
 * Insumos vendibles ("cerámicas") que el buscador del POS/Mesas ofrece como si fueran productos.
 *
 * El buscador devuelve el insumo con id VIRTUAL = insumo.id + OFFSET_INSUMO_VIRTUAL, para que el front lo
 * trate como un producto más. Al vender, el servidor lo reconoce por ese id y lo resuelve a un producto
 * "espejo" real (AgregarItemService._getOrCreateMirrorProduct).
 *
 * Esta convención estaba repetida con el literal 1000000 en 6 sitios (FacturaService, AgregarItemService,
 * POSService, ProductRepository). Centralizada aquí hay un único lugar donde cambiarla. La solución de fondo
 * (una relación explícita insumo_id en productos, sin ids mágicos) requiere una migración y queda pendiente.
 */
const OFFSET_INSUMO_VIRTUAL = 1000000;

/** ¿Este id de línea es un insumo virtual (y no un producto real)? */
function esIdInsumoVirtual(id) {
    return Number(id) >= OFFSET_INSUMO_VIRTUAL;
}

/** insumo.id -> id virtual que ve el front */
function idVirtualDeInsumo(insumoId) {
    return Number(insumoId) + OFFSET_INSUMO_VIRTUAL;
}

/** id virtual -> insumo.id real */
function insumoIdDeVirtual(idVirtual) {
    return Number(idVirtual) - OFFSET_INSUMO_VIRTUAL;
}

module.exports = { OFFSET_INSUMO_VIRTUAL, esIdInsumoVirtual, idVirtualDeInsumo, insumoIdDeVirtual };
