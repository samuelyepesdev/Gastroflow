const { num } = require('../seguro');
const { PERIODOS } = require('../periodos');

/** Parámetros de periodo compartidos por las herramientas de ventas. El servidor valida y resuelve las fechas. */
const PROPIEDADES_PERIODO = {
    periodo: {
        type: 'string',
        enum: PERIODOS,
        description: 'Periodo a consultar. Si no se indica y tampoco hay fechas, es "hoy".'
    },
    desde: { type: 'string', description: 'Fecha de inicio AAAA-MM-DD (alternativa a "periodo").' },
    hasta: { type: 'string', description: 'Fecha de fin AAAA-MM-DD. Si falta, es hoy.' }
};

const redondear = (valor, decimales = 1) => Math.round(valor * 10 ** decimales) / 10 ** decimales;

/** Variación porcentual frente al periodo anterior; null si no hay con qué comparar (anterior en cero). */
function variacionPct(actual, anterior) {
    return anterior > 0 ? redondear(((actual - anterior) / anterior) * 100) : null;
}

const ticketPromedio = (total, facturas) => (facturas > 0 ? Math.round(total / facturas) : 0);

/** Pesos y conteos que la base devuelve como texto -> números. */
function formaPago(fila) {
    return { efectivo: num(fila.efectivo), transferencia: num(fila.transferencia), bono: num(fila.bono) };
}

const periodoDe = p => ({ desde: p.desde, hasta: p.hasta, etiqueta: p.etiqueta });

module.exports = { PROPIEDADES_PERIODO, variacionPct, ticketPromedio, formaPago, periodoDe, redondear };
