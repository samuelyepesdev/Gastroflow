const Repo = require('../../../../repositories/Admin/AsistenteSistemaRepository');
const { resolverPeriodo } = require('../periodos');
const { textoSeguro, num } = require('../seguro');
const { PROPIEDADES_PERIODO, variacionPct, ticketPromedio, formaPago, periodoDe } = require('./ventasComunes');

const TOP = 10;

/** Total, facturas y ranking de un periodo ya consultado. */
function resumir({ restaurantes, eventos }) {
    const ventas = restaurantes.map(f => ({
        nombre: textoSeguro(f.nombre),
        total: num(f.total),
        facturas: num(f.facturas),
        pago: formaPago(f)
    }));
    const total = ventas.reduce((s, v) => s + v.total, 0);
    const facturas = ventas.reduce((s, v) => s + v.facturas, 0);
    const conVentas = ventas.filter(v => v.total > 0).sort((a, b) => b.total - a.total);
    const pago = ventas.reduce(
        (acc, v) => ({
            efectivo: acc.efectivo + v.pago.efectivo,
            transferencia: acc.transferencia + v.pago.transferencia,
            bono: acc.bono + v.pago.bono
        }),
        { efectivo: 0, transferencia: 0, bono: 0 }
    );
    return {
        total,
        facturas,
        pago,
        conVentas,
        eventos: { total: num(eventos?.total), facturas: num(eventos?.facturas) }
    };
}

const conParticipacion = (v, total) => ({
    nombre: v.nombre,
    total: v.total,
    facturas: v.facturas,
    participacion_pct: total > 0 ? Math.round((v.total / total) * 1000) / 10 : 0
});

module.exports = {
    descripcion:
        'Ventas de toda la plataforma en un periodo: total, facturas, ticket promedio, restaurante que más vendió, ranking de restaurantes, forma de pago y comparación con el periodo anterior. Sirve para "cuánto se ha vendido" y "qué restaurante vende más".',
    parametros: { type: 'object', properties: PROPIEDADES_PERIODO },
    async preparar(args) {
        const periodo = resolverPeriodo(args);
        const actual = resumir(await Repo.ventasPorRestaurante(periodo.desde, periodo.hasta));
        let anterior = null;
        if (periodo.anterior) {
            const previo = resumir(await Repo.ventasPorRestaurante(periodo.anterior.desde, periodo.anterior.hasta));
            anterior = { ...periodo.anterior, total: previo.total };
        }
        return {
            periodo: periodoDe(periodo),
            total: actual.total,
            facturas: actual.facturas,
            ticket_promedio: ticketPromedio(actual.total, actual.facturas),
            restaurantes_con_ventas: actual.conVentas.length,
            mejor: actual.conVentas[0] ? conParticipacion(actual.conVentas[0], actual.total) : null,
            ranking: actual.conVentas.slice(0, TOP).map(v => conParticipacion(v, actual.total)),
            forma_pago: actual.pago,
            eventos_aparte: actual.eventos,
            anterior,
            variacion_pct: anterior ? variacionPct(actual.total, anterior.total) : null
        };
    }
};
