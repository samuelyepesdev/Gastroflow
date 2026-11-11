const AsistenteRepository = require('../../../../repositories/Tenant/AsistenteRepository');
const EliminarItemService = require('../../Mesas/EliminarItemService');
const GetPedidoDetailsService = require('../../Mesas/GetPedidoDetailsService');
const { resolverProducto } = require('../../../../utils/asistenteMatching');
const { ToolError, AclaracionError } = require('./errores');
const { texto, idEstricto } = require('./validacion');
const { etiquetaMesa, resolverMesaOFalla, pedidoAbiertoOFalla } = require('./resolucion');

const msgCocina = nombre => `${nombre} ya salió a cocina, no se puede cancelar desde el asistente.`;

/** Entre las líneas vivas del pedido, la única que corresponde a lo que dijo el usuario. */
function buscarLinea(lineasVivas, textoProducto, mesa) {
    const nombres = [...new Set(lineasVivas.map(i => i.producto_nombre))];
    const r = resolverProducto(
        textoProducto,
        nombres.map((nombre, id) => ({ id, nombre, disponible: 1 }))
    );
    if (r.estado === 'ambigua') {
        throw new AclaracionError(
            `En la ${etiquetaMesa(mesa)} hay varios que coinciden con "${textoProducto}": ${r.candidatas
                .map(p => p.nombre)
                .join(', ')}. ¿Cuál quito?`
        );
    }
    if (r.estado !== 'ok') {
        throw new ToolError(`No veo "${textoProducto}" en el pedido de la ${etiquetaMesa(mesa)}.`);
    }
    const nombre = r.producto.nombre;
    const lineas = lineasVivas.filter(i => i.producto_nombre === nombre);
    if (lineas.length > 1) {
        throw new ToolError(
            `Hay ${lineas.length} líneas de ${nombre} en el pedido. Quita la que necesites desde la pantalla de mesas.`
        );
    }
    return lineas[0];
}

module.exports = {
    tipo: 'escritura',
    permiso: 'mesas.ver',
    modulo: 'mesas',
    descripcion:
        'Quita de un pedido un producto que todavía no se envió a cocina. No sirve para productos ya enviados.',
    parametros: {
        type: 'object',
        properties: {
            mesa: { type: 'string', description: 'La mesa tal como la dijo el usuario.' },
            producto: { type: 'string', description: 'El producto a quitar, tal como lo dijo el usuario.' }
        },
        required: ['mesa', 'producto']
    },

    async preparar(ctx, args) {
        const textoMesa = texto(args.mesa, 'la mesa', 60);
        const textoProducto = texto(args.producto, 'el producto', 100);
        const mesa = await resolverMesaOFalla(ctx, textoMesa);
        const pedido = await pedidoAbiertoOFalla(ctx, mesa);

        const detalle = await GetPedidoDetailsService.execute({ tenantId: ctx.tenantId, pedidoId: pedido.id });
        const vivas = detalle.items.filter(i => i.estado !== 'cancelado');
        const linea = buscarLinea(vivas, textoProducto, mesa);
        if (linea.estado !== 'pendiente') {
            throw new ToolError(msgCocina(linea.producto_nombre));
        }
        return {
            tipo: 'confirmacion',
            resumen: `Quitar ${linea.cantidad} × ${linea.producto_nombre} de la ${etiquetaMesa(mesa)}.`,
            accion: { tool: 'cancelar_item', payload: { item_id: linea.id } }
        };
    },

    async ejecutar(ctx, payload) {
        const itemId = idEstricto(payload?.item_id, 'item');
        const item = await AsistenteRepository.itemDelTenant(ctx.tenantId, itemId);
        if (!item) {
            throw new ToolError('No encontré ese producto en el pedido.');
        }
        if (item.estado !== 'pendiente') {
            throw new ToolError(msgCocina('Ese producto'));
        }
        await EliminarItemService.execute({ tenantId: ctx.tenantId, itemId, soloPendiente: true });
        return { tipo: 'resultado', datos: { mensaje: 'Listo, quité el producto del pedido.' } };
    }
};
