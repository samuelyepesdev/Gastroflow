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
    return colorTenant || colorNavbar || porDefectoFinal;
}

module.exports = colorAcento;
