const AsistenteRepository = require('../../../../repositories/Tenant/AsistenteRepository');
const GetPedidoDetailsService = require('../../Mesas/GetPedidoDetailsService');
const { limpiar, texto } = require('./validacion');
const { etiquetaMesa, resolverMesaOFalla } = require('./resolucion');

/** Solo lo necesario: sin datos del cliente (privacidad) y con las notas acotadas (texto no confiable). */
function resumirItem(i) {
    const salida = {
        producto: i.producto_nombre,
        cantidad: Number(i.cantidad),
        estado: i.estado,
        subtotal: Number(i.subtotal) || 0
    };
    if (i.nota) {
        salida.nota = limpiar(i.nota, 80);
    }
    return salida;
}

const sumar = (lista, campo) => lista.reduce((s, x) => s + (Number(x[campo]) || 0), 0);

module.exports = {
    tipo: 'lectura',
    permiso: 'mesas.ver',
    modulo: 'mesas',
    descripcion: 'Consulta qué lleva pedido una mesa, su estado y cuánto va de cuenta.',
    parametros: {
        type: 'object',
        properties: { mesa: { type: 'string', description: 'La mesa tal como la dijo el usuario.' } },
        required: ['mesa']
    },

    async preparar(ctx, args) {
        const mesa = await resolverMesaOFalla(ctx, texto(args.mesa, 'la mesa', 60));
        const base = { mesa: etiquetaMesa(mesa), estado_mesa: mesa.estado };

        const pedido = await AsistenteRepository.pedidoAbiertoDeMesa(ctx.tenantId, mesa.id);
        if (!pedido) {
            return { tipo: 'resultado', datos: { ...base, pedido_abierto: false } };
        }
        const detalle = await GetPedidoDetailsService.execute({ tenantId: ctx.tenantId, pedidoId: pedido.id });
        const items = detalle.items.filter(i => i.estado !== 'cancelado').map(resumirItem);
        return {
            tipo: 'resultado',
            datos: {
                ...base,
                pedido_abierto: true,
                estado_pedido: detalle.pedido.estado,
                items,
                total: sumar(items, 'subtotal'),
                abonado: sumar(detalle.abonos || [], 'monto')
            }
        };
    }
};
