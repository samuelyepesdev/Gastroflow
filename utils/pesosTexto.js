/**
 * Montos en palabras para el asistente: "1.234.567 pesos". El modelo de lenguaje recibe la cifra ya escrita
 * (y la moneda declarada) para no inventar símbolos ni monedas ("euros") ni dejarla sin puntos de miles.
 * El agrupado es manual: Intl con es-CO no separa los miles de 4 cifras ("1234").
 */
const MONEDA = 'pesos colombianos (COP)';

function pesosTexto(valor) {
    const n = Math.round(Number(valor));
    if (!Number.isFinite(n)) {
        return '0 pesos';
    }
    const agrupado = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${n < 0 ? '-' : ''}${agrupado} ${Math.abs(n) === 1 ? 'peso' : 'pesos'}`;
}

module.exports = { pesosTexto, MONEDA };
