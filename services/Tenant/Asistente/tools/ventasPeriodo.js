// Reutiliza las consultas por tenant del asistente del superadmin: ya excluyen los eventos aparte y reciben el
// tenant como parámetro. Aquí el tenant sale SIEMPRE de la sesión, nunca de lo que diga el modelo.
const Repo = require('../../../../repositories/Admin/AsistenteSistemaRepository');
const { resolverPeriodo } = require('../../../Admin/AsistenteSistema/periodos');
const { textoSeguro, num } = require('../../../Admin/AsistenteSistema/seguro');
const {
    PROPIEDADES_PERIODO,
    variacionPct,
    ticketPromedio,
    periodoDe
} = require('../../../Admin/AsistenteSistema/herramientas/ventasComunes');
const { pesosTexto, MONEDA } = require('../../../../utils/pesosTexto');

const TOP_PRODUCTOS = 5;

module.exports = {
    tipo: 'lectura',
    permiso: 'ventas.ver',
    modulo: 'ventas',
    descripcion:
        'Ventas del restaurante en un periodo (hoy, ayer, últimos 7 días, este mes, mes pasado, este año, histórico o dos fechas): total, ticket promedio, forma de pago, mejor día, productos más vendidos y comparación con el periodo anterior. Úsala para "cómo nos fue en el mes" o "qué fue lo más vendido".',
    parametros: { type: 'object', properties: { ...PROPIEDADES_PERIODO } },

    async preparar(ctx, args) {
        const periodo = resolverPeriodo(args);
        const actual = await Repo.ventasDeRestaurante(ctx.tenantId, periodo.desde, periodo.hasta);
        const total = num(actual.resumen.total);
        const facturas = num(actual.resumen.facturas);

        let anterior = null;
        if (periodo.anterior) {
            const previo = await Repo.ventasDeRestaurante(ctx.tenantId, periodo.anterior.desde, periodo.anterior.hasta);
            const totalPrevio = num(previo.resumen.total);
            anterior = { ...periodo.anterior, total: totalPrevio, total_texto: pesosTexto(totalPrevio) };
        }

        const productos = await Repo.topProductos({
            tenantId: ctx.tenantId,
            desde: periodo.desde,
            hasta: periodo.hasta,
            limite: TOP_PRODUCTOS
        });
        const promedio = ticketPromedio(total, facturas);

        return {
            tipo: 'resultado',
            datos: {
                moneda: MONEDA,
                periodo: periodoDe(periodo),
                total,
                total_texto: pesosTexto(total),
                facturas,
                ticket_promedio_texto: pesosTexto(promedio),
                forma_pago: {
                    efectivo_texto: pesosTexto(actual.resumen.efectivo),
                    transferencia_texto: pesosTexto(actual.resumen.transferencia),
                    bono_texto: pesosTexto(actual.resumen.bono)
                },
                mejor_dia: actual.mejorDia
                    ? { dia: actual.mejorDia.dia, total_texto: pesosTexto(actual.mejorDia.total) }
                    : null,
                top_productos: productos.map(p => ({
                    nombre: textoSeguro(p.nombre),
                    unidades: num(p.unidades),
                    total: num(p.total),
                    total_texto: pesosTexto(p.total)
                })),
                eventos_aparte_texto: pesosTexto(actual.eventos.total),
                anterior,
                variacion_pct: anterior ? variacionPct(total, anterior.total) : null
            }
        };
    }
};
