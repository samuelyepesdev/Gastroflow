const Repo = require('../../../../repositories/Admin/AsistenteSistemaRepository');
const { resolverPeriodo } = require('../periodos');
const { textoSeguro, num } = require('../seguro');
const { resolverRestaurante } = require('./restaurante');
const { PROPIEDADES_PERIODO, periodoDe } = require('./ventasComunes');

const TOP = 10;

module.exports = {
    descripcion:
        'Productos más vendidos (por unidades) en un periodo, en toda la plataforma o en un restaurante si se indica su nombre.',
    parametros: {
        type: 'object',
        properties: {
            nombre: {
                type: 'string',
                description: 'Opcional: nombre del restaurante. Sin él, se consulta toda la plataforma.'
            },
            ...PROPIEDADES_PERIODO
        }
    },
    async preparar(args) {
        const restaurante =
            args.nombre === undefined || args.nombre === null ? null : await resolverRestaurante(args.nombre);
        const periodo = resolverPeriodo(args);
        const filas = await Repo.topProductos({
            tenantId: restaurante ? restaurante.id : null,
            desde: periodo.desde,
            hasta: periodo.hasta,
            limite: TOP
        });
        return {
            restaurante,
            periodo: periodoDe(periodo),
            productos: filas.map(p => ({
                nombre: textoSeguro(p.nombre),
                unidades: num(p.unidades),
                total: num(p.total)
            }))
        };
    }
};
