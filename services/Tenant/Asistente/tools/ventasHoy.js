const StatsRepository = require('../../../../repositories/Tenant/StatsRepository');
const { pesosTexto, MONEDA } = require('../../../../utils/pesosTexto');

module.exports = {
    tipo: 'lectura',
    permiso: 'ventas.ver',
    modulo: 'ventas',
    descripcion: 'Consulta cuánto se ha vendido hoy y cuántas ventas van.',
    parametros: { type: 'object', properties: {} },

    async preparar(ctx) {
        const v = await StatsRepository.getVentasHoy(ctx.tenantId);
        return {
            tipo: 'resultado',
            datos: { moneda: MONEDA, total: v.total, total_texto: pesosTexto(v.total), cantidad_ventas: v.cantidad }
        };
    }
};
