const Repo = require('../../../../repositories/Admin/AsistenteSistemaRepository');
const { resolverPeriodo } = require('../periodos');
const { textoSeguro, num } = require('../seguro');
const { resolverRestaurante } = require('./restaurante');
const { PROPIEDADES_PERIODO, variacionPct, ticketPromedio, formaPago, periodoDe } = require('./ventasComunes');

const TOP_PRODUCTOS = 5;

module.exports = {
    descripcion:
        'Ventas de UN restaurante en un periodo: total, facturas, ticket promedio, forma de pago, mejor día, productos más vendidos y comparación con el periodo anterior.',
    parametros: {
        type: 'object',
        properties: {
            nombre: { type: 'string', description: 'Nombre o parte del nombre del restaurante.' },
            ...PROPIEDADES_PERIODO
        },
        required: ['nombre']
    },
    async preparar(args) {
        const restaurante = await resolverRestaurante(args.nombre);
        const periodo = resolverPeriodo(args);
        const actual = await Repo.ventasDeRestaurante(restaurante.id, periodo.desde, periodo.hasta);
        const total = num(actual.resumen.total);
        const facturas = num(actual.resumen.facturas);
        let anterior = null;
        if (periodo.anterior) {
            const previo = await Repo.ventasDeRestaurante(
                restaurante.id,
                periodo.anterior.desde,
                periodo.anterior.hasta
            );
            anterior = { ...periodo.anterior, total: num(previo.resumen.total) };
        }
        const productos = await Repo.topProductos({
            tenantId: restaurante.id,
            desde: periodo.desde,
            hasta: periodo.hasta,
            limite: TOP_PRODUCTOS
        });
        return {
            restaurante,
            periodo: periodoDe(periodo),
            total,
            facturas,
            ticket_promedio: ticketPromedio(total, facturas),
            forma_pago: formaPago(actual.resumen),
            mejor_dia: actual.mejorDia ? { dia: actual.mejorDia.dia, total: num(actual.mejorDia.total) } : null,
            top_productos: productos.map(p => ({
                nombre: textoSeguro(p.nombre),
                unidades: num(p.unidades),
                total: num(p.total)
            })),
            eventos_aparte: { total: num(actual.eventos.total), facturas: num(actual.eventos.facturas) },
            anterior,
            variacion_pct: anterior ? variacionPct(total, anterior.total) : null
        };
    }
};
