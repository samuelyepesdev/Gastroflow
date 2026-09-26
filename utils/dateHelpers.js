/**
 * Convierte una fecha que viene de la BD (Date o string MySQL "YYYY-MM-DD HH:mm:ss")
 * a ISO en UTC, para que el cliente la muestre en su zona horaria.
 * Las fechas guardadas en MySQL TIMESTAMP están en UTC; si llegan como string sin Z,
 * Node las interpreta como hora local del servidor y se muestran mal. Tratarlas como UTC.
 * @param {Date|string|null} fecha
 * @returns {string} ISO string (ej. "2026-02-28T01:33:36.000Z") o ''
 */
function toFechaISOUtc(fecha) {
    if (fecha === null || fecha === undefined) {
        return '';
    }
    if (typeof fecha === 'string') {
        // MySQL devuelve '0000-00-00 00:00:00' para fechas invalidas/vacias
        if (fecha.startsWith('0000-00-00')) {
            return '';
        }
        const mysqlMatch = fecha.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/);
        if (mysqlMatch) {
            return mysqlMatch[1] + 'T' + mysqlMatch[2] + '.000Z';
        }
        if (fecha.endsWith('Z') || fecha.includes('T')) {
            return new Date(fecha).toISOString();
        }
    }
    if (fecha instanceof Date) {
        if (isNaN(fecha.getTime())) {
            return '';
        }
        return fecha.toISOString();
    }
    try {
        const d = new Date(fecha);
        return isNaN(d.getTime()) ? '' : d.toISOString();
    } catch (e) {
        return '';
    }
}

/**
 * Normaliza una columna DATE a 'YYYY-MM-DD'.
 * En producción (MYSQL_URL) mysql2 devuelve las DATE como objetos Date (ver
 * config/database.js: dateStrings nunca aplicó ahí) y en local como string;
 * comparar un Date contra un string 'YYYY-MM-DD' siempre da false. mysql2 arma
 * el Date a medianoche local, así que se leen las partes locales.
 * @param {Date|string|null} valor
 * @returns {string|null}
 */
function toFechaDia(valor) {
    if (valor === null || valor === undefined || valor === '') {
        return null;
    }
    if (valor instanceof Date) {
        if (Number.isNaN(valor.getTime())) {
            return null;
        }
        const m = String(valor.getMonth() + 1).padStart(2, '0');
        const d = String(valor.getDate()).padStart(2, '0');
        return `${valor.getFullYear()}-${m}-${d}`;
    }
    return String(valor).slice(0, 10);
}

module.exports = { toFechaISOUtc, toFechaDia };
