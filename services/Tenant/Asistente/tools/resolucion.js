const AsistenteResolverService = require('../AsistenteResolverService');
const AsistenteRepository = require('../../../../repositories/Tenant/AsistenteRepository');
const { ToolError, AclaracionError } = require('./errores');

/** Texto legible de una mesa: "mesa 4" o "mesa T1 (Terraza 1)". */
function etiquetaMesa(mesa) {
    return mesa.descripcion ? `mesa ${mesa.numero} (${mesa.descripcion})` : `mesa ${mesa.numero}`;
}

/** Lo que dijo el usuario -> una mesa del tenant, o falla pidiendo aclarar. */
async function resolverMesaOFalla(ctx, textoMesa) {
    const r = await AsistenteResolverService.resolverMesa(ctx.tenantId, textoMesa);
    if (r.estado === 'ok') {
        return r.mesa;
    }
    if (r.estado === 'ambigua') {
        throw new AclaracionError(
            `Hay varias mesas que coinciden con "${textoMesa}": ${r.candidatas.map(etiquetaMesa).join(', ')}. ¿Cuál es?`
        );
    }
    throw new ToolError(`No encontré la mesa "${textoMesa}".`);
}

/** Lo que dijo el usuario -> un producto vendible del tenant ({producto, aproximada}), o falla. */
async function resolverProductoOFalla(ctx, textoProducto) {
    const r = await AsistenteResolverService.resolverProducto(ctx.tenantId, textoProducto);
    if (r.estado === 'ok') {
        return r;
    }
    if (r.estado === 'ambigua') {
        throw new AclaracionError(
            `Hay varios productos que coinciden con "${textoProducto}": ${r.candidatas.map(p => p.nombre).join(', ')}. ¿Cuál?`
        );
    }
    if (r.estado === 'no_disponible') {
        const nombre = r.producto ? r.producto.nombre : textoProducto;
        throw new ToolError(`"${nombre}" no está disponible por el momento.`);
    }
    throw new ToolError(`No encontré "${textoProducto}" en el menú.`);
}

async function pedidoAbiertoOFalla(ctx, mesa) {
    const pedido = await AsistenteRepository.pedidoAbiertoDeMesa(ctx.tenantId, mesa.id);
    if (!pedido) {
        throw new ToolError(`La ${etiquetaMesa(mesa)} no tiene un pedido abierto.`);
    }
    return pedido;
}

module.exports = { etiquetaMesa, resolverMesaOFalla, resolverProductoOFalla, pedidoAbiertoOFalla };
