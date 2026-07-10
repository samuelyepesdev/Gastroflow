/**
 * unidadesCosteo - Conversión de unidades de compra/receta a unidad base (g, ml o UND).
 * Fuente única usada por CosteoService e InventarioService: antes cada uno tenía su propia
 * tabla de conversión (CosteoService soportaba 'lb', InventarioService no), lo que permitía
 * que el costeo y el descuento de inventario calcularan cantidades distintas para el mismo insumo.
 */

const FACTORES_A_BASE = {
    kg: { factor: 1000, tipoBase: 'g' },
    g: { factor: 1, tipoBase: 'g' },
    gr: { factor: 1, tipoBase: 'g' },
    mg: { factor: 0.001, tipoBase: 'g' },
    lb: { factor: 453.592, tipoBase: 'g' },
    l: { factor: 1000, tipoBase: 'ml' },
    ml: { factor: 1, tipoBase: 'ml' },
    und: { factor: 1, tipoBase: 'UND' },
    u: { factor: 1, tipoBase: 'UND' }
};

/**
 * @param {string} unidad
 * @returns {{ factor: number, tipoBase: 'g'|'ml'|'UND' }}
 */
function infoUnidad(unidad) {
    const u = String(unidad || 'UND')
        .trim()
        .toLowerCase();
    return FACTORES_A_BASE[u] || { factor: 1, tipoBase: 'UND' };
}

/**
 * Convierte una cantidad expresada en `unidad` a su unidad base (g, ml o UND).
 * @param {number|string} cantidad
 * @param {string} unidad
 * @returns {{ cantidadBase: number, tipoBase: 'g'|'ml'|'UND' }}
 */
function convertirABase(cantidad, unidad) {
    const q = parseFloat(cantidad) || 0;
    const { factor, tipoBase } = infoUnidad(unidad);
    return { cantidadBase: q * factor, tipoBase };
}

/**
 * Deriva el tipo de unidad base (g/ml/UND) a partir de una unidad de compra.
 * Usado para autocompletar `insumos.unidad_base` a partir de `unidad_compra`.
 * @param {string} unidadCompra
 * @returns {'g'|'ml'|'UND'}
 */
function derivarTipoBase(unidadCompra) {
    return infoUnidad(unidadCompra).tipoBase;
}

module.exports = { convertirABase, derivarTipoBase, infoUnidad };
