/**
 * Color de acento de un tenant para las variables CSS --accent* de las vistas
 * (Dashboard, Productos, Ventas, Clasificación...). Antes cada vista repetía
 * esta misma cadena de fallbacks a mano, con ligeras variaciones -- Dashboard
 * también miraba `nav.primaryColor`, las demás no, así que un tenant sin
 * `config.colores.primary` veía un acento distinto en Dashboard que en el
 * resto del panel.
 *
 * Prioridad: color configurado por el tenant > color del navbar (JWT legado /
 * tenant inactivo, ver middleware/navbarLocals.js) > coral de marca por defecto.
 *
 * @param {object|null} tenant
 * @param {string|null} [colorNavbar] - nav.primaryColor, si la vista lo tiene
 * @param {string} [porDefecto]
 * @returns {string}
 */
function colorAcento(tenant, colorNavbar, porDefecto) {
    const porDefectoFinal = porDefecto || '#ff5a36';
    const colorTenant = tenant && tenant.config && tenant.config.colores && tenant.config.colores.primary;
    return colorHexONull(colorTenant) || colorHexONull(colorNavbar) || porDefectoFinal;
}

// Estos valores acaban dentro de bloques <style>; <%= %> no escapa ; : ( ) /, así que solo se
// aceptan colores hex (#rgb, #rrggbb, #rrggbbaa).
const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function colorHexONull(valor) {
    const v = typeof valor === 'string' ? valor.trim() : '';
    return HEX_COLOR_RE.test(v) ? v : null;
}

/** Devuelve una copia de `colores` conservando solo las claves cuyo valor es un hex válido. */
function sanitizarColores(colores) {
    const limpio = {};
    if (colores && typeof colores === 'object' && !Array.isArray(colores)) {
        for (const [clave, valor] of Object.entries(colores)) {
            const hex = colorHexONull(valor);
            if (hex) {
                limpio[clave] = hex;
            }
        }
    }
    return limpio;
}

module.exports = colorAcento;
module.exports.colorHexONull = colorHexONull;
module.exports.sanitizarColores = sanitizarColores;
