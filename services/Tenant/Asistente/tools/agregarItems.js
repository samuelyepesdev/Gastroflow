const ProductRepository = require('../../../../repositories/Tenant/ProductRepository');
const AbrirPedidoService = require('../../Mesas/AbrirPedidoService');
const AgregarItemService = require('../../Mesas/AgregarItemService');
const { ToolError, mensajeDe } = require('./errores');
const { texto, notaOpcional, entero, idEstricto } = require('./validacion');
const { etiquetaMesa, resolverMesaOFalla, resolverProductoOFalla } = require('./resolucion');

const MAX_ITEMS = 20;
const MAX_CANTIDAD = 50;

/** Valida lo que dijo el modelo ANTES de resolver nada contra la BD. */
function leerArgumentos(args) {
    const textoMesa = texto(args.mesa, 'la mesa', 60);
    if (!Array.isArray(args.items) || args.items.length < 1 || args.items.length > MAX_ITEMS) {
        throw new ToolError(`Debes indicar entre 1 y ${MAX_ITEMS} productos.`);
    }
    const pedidos = args.items.map(it => {
        if (!it || typeof it !== 'object') {
            throw new ToolError('Producto inválido.');
        }
        return {
            producto: texto(it.producto, 'el producto', 100),
            cantidad: entero(it.cantidad, 'La cantidad', 1, MAX_CANTIDAD),
            nota: notaOpcional(it.nota, 200)
        };
    });
    return { textoMesa, pedidos };
}

/** Valida el payload de una acción ya preparada (solo ids enteros). */
function leerPayload(payload) {
    const mesaId = idEstricto(payload?.mesa_id, 'mesa');
    if (!Array.isArray(payload.items) || payload.items.length < 1 || payload.items.length > MAX_ITEMS) {
        throw new ToolError('Acción inválida (items).');
    }
    const items = payload.items.map(it => ({
        productoId: idEstricto(it?.producto_id, 'producto'),
        cantidad: entero(it.cantidad, 'La cantidad', 1, MAX_CANTIDAD),
        nota: notaOpcional(it.nota, 200)
    }));
    return { mesaId, items };
}

function describirLinea(r) {
    return (
        `${r.cantidad} × ${r.nombre}` +
        (r.nota ? ` (${r.nota})` : '') +
        (r.aproximada ? ` (entendí "${r.producto}")` : '')
    );
}

/** Agrega un item releyendo el producto: valen el precio y la disponibilidad de ahora, no los de la preparación. */
async function agregarUno(ctx, pedidoId, it) {
    const producto = await ProductRepository.findById(it.productoId, ctx.tenantId);
    if (!producto) {
        return { fallo: 'un producto ya no existe' };
    }
    if (!producto.disponible) {
        return { fallo: `${producto.nombre}: no está disponible` };
    }
    try {
        await AgregarItemService.execute({
            tenantId: ctx.tenantId,
            pedidoId,
            producto_id: producto.id,
            cantidad: it.cantidad,
            unidad: 'UND',
            precio: producto.precio_unidad,
            nota: it.nota,
            modificadores_seleccion: [],
            puedeUsarModificadores: false
        });
        return { agregado: `${it.cantidad} × ${producto.nombre}` };
    } catch (e) {
        return { fallo: `${producto.nombre}: ${mensajeDe(e)}` };
    }
}

module.exports = {
    tipo: 'escritura',
    permiso: 'mesas.ver',
    modulo: 'mesas',
    descripcion:
        'Agrega productos al pedido de una mesa (abre el pedido si no existe). Úsala cuando el usuario pida algo para una mesa o domicilio.',
    parametros: {
        type: 'object',
        properties: {
            mesa: {
                type: 'string',
                description: 'La mesa tal como la dijo el usuario: número o nombre ("4", "terraza", "domicilio").'
            },
            items: {
                type: 'array',
                minItems: 1,
                maxItems: MAX_ITEMS,
                items: {
                    type: 'object',
                    properties: {
                        producto: { type: 'string', description: 'Nombre del producto tal como lo dijo el usuario.' },
                        cantidad: { type: 'integer', minimum: 1, maximum: MAX_CANTIDAD },
                        nota: { type: 'string', description: 'Indicación opcional para cocina ("sin cebolla").' }
                    },
                    required: ['producto', 'cantidad']
                }
            }
        },
        required: ['mesa', 'items']
    },

    async preparar(ctx, args) {
        const { textoMesa, pedidos } = leerArgumentos(args);
        const mesa = await resolverMesaOFalla(ctx, textoMesa);
        const resueltos = [];
        for (const p of pedidos) {
            const r = await resolverProductoOFalla(ctx, p.producto);
            resueltos.push({ ...p, nombre: r.producto.nombre, id: r.producto.id, aproximada: !!r.aproximada });
        }
        return {
            tipo: 'confirmacion',
            resumen: `Agregar ${resueltos.map(describirLinea).join(', ')} a la ${etiquetaMesa(mesa)}.`,
            accion: {
                tool: 'agregar_items',
                payload: {
                    mesa_id: mesa.id,
                    items: resueltos.map(r => ({ producto_id: r.id, cantidad: r.cantidad, nota: r.nota }))
                }
            }
        };
    },

    async ejecutar(ctx, payload) {
        const { mesaId, items } = leerPayload(payload);
        const pedido = await AbrirPedidoService.execute({ tenantId: ctx.tenantId, mesa_id: mesaId });

        const agregados = [];
        const fallidos = [];
        for (const it of items) {
            const r = await agregarUno(ctx, pedido.id, it);
            (r.agregado ? agregados : fallidos).push(r.agregado || r.fallo);
        }

        if (agregados.length === 0) {
            throw new ToolError(`No pude agregar nada. ${fallidos.join('; ')}.`);
        }
        const mensaje =
            `Listo, agregué ${agregados.join(', ')}.` +
            (fallidos.length > 0 ? ` No pude agregar: ${fallidos.join('; ')}.` : '');
        return { tipo: 'resultado', datos: { mensaje } };
    }
};
