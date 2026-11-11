const LiberarMesaService = require('../../Mesas/LiberarMesaService');
const { texto, idEstricto } = require('./validacion');
const { etiquetaMesa, resolverMesaOFalla } = require('./resolucion');

module.exports = {
    tipo: 'escritura',
    permiso: 'mesas.ver',
    modulo: 'mesas',
    descripcion: 'Libera una mesa que ya no tiene productos activos.',
    parametros: {
        type: 'object',
        properties: { mesa: { type: 'string', description: 'La mesa tal como la dijo el usuario.' } },
        required: ['mesa']
    },

    async preparar(ctx, args) {
        const mesa = await resolverMesaOFalla(ctx, texto(args.mesa, 'la mesa', 60));
        return {
            tipo: 'confirmacion',
            resumen: `Liberar la ${etiquetaMesa(mesa)}.`,
            accion: { tool: 'liberar_mesa', payload: { mesa_id: mesa.id } }
        };
    },

    async ejecutar(ctx, payload) {
        const mesaId = idEstricto(payload?.mesa_id, 'mesa');
        await LiberarMesaService.execute({ tenantId: ctx.tenantId, mesaId });
        return { tipo: 'resultado', datos: { mensaje: 'Listo, la mesa quedó libre.' } };
    }
};
