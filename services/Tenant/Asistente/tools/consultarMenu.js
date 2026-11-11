const AsistenteResolverService = require('../AsistenteResolverService');
const { ToolError } = require('./errores');
const { texto } = require('./validacion');

module.exports = {
    tipo: 'lectura',
    permiso: 'productos.ver',
    modulo: 'productos',
    descripcion: 'Consulta el precio y la disponibilidad de un producto del menú.',
    parametros: {
        type: 'object',
        properties: { producto: { type: 'string', description: 'El producto tal como lo dijo el usuario.' } },
        required: ['producto']
    },

    async preparar(ctx, args) {
        const textoProducto = texto(args.producto, 'el producto', 100);
        const r = await AsistenteResolverService.resolverProducto(ctx.tenantId, textoProducto);
        const lista = r.producto ? [r.producto] : r.candidatas || [];
        if (lista.length === 0) {
            throw new ToolError(`No encontré "${textoProducto}" en el menú.`);
        }
        const coincidencias = lista.map(p => ({
            nombre: p.nombre,
            precio: Number(p.precio_unidad) || 0,
            disponible: !!p.disponible
        }));
        return { tipo: 'resultado', datos: { coincidencias } };
    }
};
