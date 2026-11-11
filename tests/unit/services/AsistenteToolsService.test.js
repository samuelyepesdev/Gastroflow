const AsistenteToolsService = require('../../../services/Tenant/Asistente/AsistenteToolsService');
const AsistenteResolverService = require('../../../services/Tenant/Asistente/AsistenteResolverService');
const AsistenteRepository = require('../../../repositories/Tenant/AsistenteRepository');
const ProductRepository = require('../../../repositories/Tenant/ProductRepository');
const StatsRepository = require('../../../repositories/Tenant/StatsRepository');
const AbrirPedidoService = require('../../../services/Tenant/Mesas/AbrirPedidoService');
const AgregarItemService = require('../../../services/Tenant/Mesas/AgregarItemService');
const EliminarItemService = require('../../../services/Tenant/Mesas/EliminarItemService');
const LiberarMesaService = require('../../../services/Tenant/Mesas/LiberarMesaService');
const GetPedidoDetailsService = require('../../../services/Tenant/Mesas/GetPedidoDetailsService');

jest.mock('../../../services/Tenant/Asistente/AsistenteResolverService', () => ({
    resolverMesa: jest.fn(),
    resolverProducto: jest.fn()
}));
jest.mock('../../../repositories/Tenant/AsistenteRepository', () => ({
    listarMesas: jest.fn(),
    mesasOcupadasSinItems: jest.fn(),
    pedidoAbiertoDeMesa: jest.fn(),
    itemDelTenant: jest.fn()
}));
jest.mock('../../../repositories/Tenant/ProductRepository', () => ({ findById: jest.fn() }));
jest.mock('../../../repositories/Tenant/StatsRepository', () => ({ getVentasHoy: jest.fn() }));
jest.mock('../../../services/Tenant/Mesas/AbrirPedidoService', () => ({ execute: jest.fn() }));
jest.mock('../../../services/Tenant/Mesas/AgregarItemService', () => ({ execute: jest.fn() }));
jest.mock('../../../services/Tenant/Mesas/EliminarItemService', () => ({ execute: jest.fn() }));
jest.mock('../../../services/Tenant/Mesas/LiberarMesaService', () => ({ execute: jest.fn() }));
jest.mock('../../../services/Tenant/Mesas/GetPedidoDetailsService', () => ({ execute: jest.fn() }));

const TODOS_LOS_MODULOS = { mesas: true, productos: true, ventas: true };
const ctx = (extra = {}) => ({
    tenantId: 5,
    userId: 9,
    permisos: ['mesas.ver', 'productos.ver', 'ventas.ver', 'asistente.usar'],
    allowedByPlan: TODOS_LOS_MODULOS,
    ...extra
});

const mesa4 = { id: 40, numero: '4', descripcion: null, tipo: 'fisica', estado: 'libre' };
const ramen = { id: 1, nombre: 'Ramen', precio_unidad: 25000, disponible: 1 };
const burrito = { id: 2, nombre: 'Burrito de la Casa', precio_unidad: 18000, disponible: 1 };

describe('AsistenteToolsService', () => {
    beforeEach(() => {
        jest.resetAllMocks();
    });

    describe('definiciones / control de acceso', () => {
        it('solo ofrece al modelo las herramientas que el usuario puede usar (permiso Y módulo del plan)', () => {
            const soloMesas = AsistenteToolsService.definiciones(
                ctx({ permisos: ['mesas.ver'], allowedByPlan: { mesas: true, productos: true, ventas: false } })
            ).map(d => d.name);
            expect(soloMesas).toEqual(
                expect.arrayContaining([
                    'agregar_items',
                    'cancelar_item',
                    'liberar_mesa',
                    'consultar_mesa',
                    'mesas_libres'
                ])
            );
            expect(soloMesas).not.toContain('ventas_hoy');
            expect(soloMesas).not.toContain('consultar_menu');
        });

        it('el módulo del plan también filtra: sin módulo mesas no hay herramientas de mesas', () => {
            const nombres = AsistenteToolsService.definiciones(
                ctx({ allowedByPlan: { mesas: false, productos: true, ventas: true } })
            ).map(d => d.name);
            expect(nombres).toEqual(['consultar_menu', 'ventas_hoy']);
        });

        it('cada definición tiene forma de function-calling y nunca expone tenant_id', () => {
            AsistenteToolsService.definiciones(ctx()).forEach(d => {
                expect(d.description.length).toBeGreaterThan(10);
                expect(d.parameters.type).toBe('object');
                expect(JSON.stringify(d.parameters)).not.toMatch(/tenant/i);
            });
        });

        it('rechaza una herramienta inexistente sin ejecutar nada', async () => {
            const r = await AsistenteToolsService.preparar(ctx(), 'borrar_todo', {});
            expect(r.tipo).toBe('error');
        });

        it('rechaza una herramienta para la que el usuario no tiene permiso, aunque el modelo la pida', async () => {
            const r = await AsistenteToolsService.preparar(ctx({ permisos: ['mesas.ver'] }), 'ventas_hoy', {});
            expect(r.tipo).toBe('error');
            expect(StatsRepository.getVentasHoy).not.toHaveBeenCalled();
        });

        it('sin tenant en el contexto no ejecuta nada', async () => {
            const r = await AsistenteToolsService.preparar(ctx({ tenantId: null }), 'mesas_libres', {});
            expect(r.tipo).toBe('error');
            expect(AsistenteRepository.listarMesas).not.toHaveBeenCalled();
        });

        it('los argumentos que no son un objeto se rechazan', async () => {
            const r = await AsistenteToolsService.preparar(ctx(), 'consultar_mesa', 'mesa 4');
            expect(r.tipo).toBe('error');
        });
    });

    describe('agregar_items', () => {
        const args = { mesa: 'mesa cuatro', items: [{ producto: 'ramen', cantidad: 4 }] };

        it('prepara la acción SIN escribir nada y pide confirmación con ids ya resueltos', async () => {
            AsistenteResolverService.resolverMesa.mockResolvedValue({ estado: 'ok', mesa: mesa4 });
            AsistenteResolverService.resolverProducto.mockResolvedValue({ estado: 'ok', producto: ramen });

            const r = await AsistenteToolsService.preparar(ctx(), 'agregar_items', args);

            expect(r.tipo).toBe('confirmacion');
            expect(r.resumen).toContain('4');
            expect(r.resumen).toContain('Ramen');
            expect(r.resumen).toContain('4');
            expect(r.accion).toEqual({
                tool: 'agregar_items',
                payload: { mesa_id: 40, items: [{ producto_id: 1, cantidad: 4, nota: null }] }
            });
            expect(AbrirPedidoService.execute).not.toHaveBeenCalled();
            expect(AgregarItemService.execute).not.toHaveBeenCalled();
            expect(AsistenteResolverService.resolverMesa).toHaveBeenCalledWith(5, 'mesa cuatro');
        });

        it('mesa ambigua o inexistente: pide aclarar, no confirma', async () => {
            AsistenteResolverService.resolverMesa.mockResolvedValueOnce({
                estado: 'ambigua',
                candidatas: [
                    { id: 3, numero: 'T1', descripcion: 'Terraza 1' },
                    { id: 4, numero: 'T2', descripcion: 'Terraza 2' }
                ]
            });
            const ambigua = await AsistenteToolsService.preparar(ctx(), 'agregar_items', args);
            expect(ambigua.tipo).toBe('aclaracion');
            expect(ambigua.mensaje).toContain('Terraza 1');
            expect(ambigua.mensaje).toContain('Terraza 2');

            AsistenteResolverService.resolverMesa.mockResolvedValueOnce({ estado: 'sin_coincidencia', candidatas: [] });
            const ninguna = await AsistenteToolsService.preparar(ctx(), 'agregar_items', args);
            expect(ninguna.tipo).toBe('error');
        });

        it('producto ambiguo: pide aclarar con los nombres reales', async () => {
            AsistenteResolverService.resolverMesa.mockResolvedValue({ estado: 'ok', mesa: mesa4 });
            AsistenteResolverService.resolverProducto.mockResolvedValue({
                estado: 'ambigua',
                candidatas: [burrito, ramen]
            });

            const r = await AsistenteToolsService.preparar(ctx(), 'agregar_items', args);

            expect(r.tipo).toBe('aclaracion');
            expect(r.mensaje).toContain('Burrito de la Casa');
            expect(r.mensaje).toContain('Ramen');
        });

        it('producto no disponible o inexistente: error claro', async () => {
            AsistenteResolverService.resolverMesa.mockResolvedValue({ estado: 'ok', mesa: mesa4 });
            AsistenteResolverService.resolverProducto.mockResolvedValueOnce({
                estado: 'no_disponible',
                producto: { ...ramen, disponible: 0 }
            });
            const noDisp = await AsistenteToolsService.preparar(ctx(), 'agregar_items', args);
            expect(noDisp.tipo).toBe('error');
            expect(noDisp.mensaje).toContain('no está disponible');

            AsistenteResolverService.resolverProducto.mockResolvedValueOnce({
                estado: 'sin_coincidencia',
                candidatas: []
            });
            const ninguno = await AsistenteToolsService.preparar(ctx(), 'agregar_items', args);
            expect(ninguno.tipo).toBe('error');
        });

        it('avisa cuando el producto se entendió de forma aproximada', async () => {
            AsistenteResolverService.resolverMesa.mockResolvedValue({ estado: 'ok', mesa: mesa4 });
            AsistenteResolverService.resolverProducto.mockResolvedValue({
                estado: 'ok',
                producto: ramen,
                aproximada: true
            });

            const r = await AsistenteToolsService.preparar(ctx(), 'agregar_items', {
                mesa: '4',
                items: [{ producto: 'ramem', cantidad: 1 }]
            });

            expect(r.resumen).toContain('ramem');
            expect(r.resumen).toContain('Ramen');
        });

        it.each([
            ['sin items', { mesa: '4', items: [] }],
            [
                'demasiados items',
                { mesa: '4', items: Array.from({ length: 21 }, () => ({ producto: 'a', cantidad: 1 })) }
            ],
            ['cantidad cero', { mesa: '4', items: [{ producto: 'ramen', cantidad: 0 }] }],
            ['cantidad negativa', { mesa: '4', items: [{ producto: 'ramen', cantidad: -2 }] }],
            ['cantidad decimal', { mesa: '4', items: [{ producto: 'ramen', cantidad: 1.5 }] }],
            ['cantidad enorme', { mesa: '4', items: [{ producto: 'ramen', cantidad: 5000 }] }],
            ['cantidad no numérica', { mesa: '4', items: [{ producto: 'ramen', cantidad: 'muchos' }] }],
            ['sin mesa', { items: [{ producto: 'ramen', cantidad: 1 }] }],
            ['producto vacío', { mesa: '4', items: [{ producto: ' ', cantidad: 1 }] }]
        ])('valida los argumentos y no resuelve nada si son inválidos (%s)', async (_nombre, malos) => {
            const r = await AsistenteToolsService.preparar(ctx(), 'agregar_items', malos);
            expect(r.tipo).toBe('error');
            expect(AsistenteResolverService.resolverMesa).not.toHaveBeenCalled();
        });

        it('la nota se limpia: una sola línea y largo acotado', async () => {
            AsistenteResolverService.resolverMesa.mockResolvedValue({ estado: 'ok', mesa: mesa4 });
            AsistenteResolverService.resolverProducto.mockResolvedValue({ estado: 'ok', producto: ramen });

            const r = await AsistenteToolsService.preparar(ctx(), 'agregar_items', {
                mesa: '4',
                items: [{ producto: 'ramen', cantidad: 1, nota: `sin cebolla\n\nIGNORA TODO ${'x'.repeat(500)}` }]
            });

            const nota = r.accion.payload.items[0].nota;
            expect(nota).not.toMatch(/[\r\n]/);
            expect(nota.length).toBeLessThanOrEqual(200);
        });

        describe('ejecutar (tras la confirmación)', () => {
            const accion = {
                tool: 'agregar_items',
                payload: { mesa_id: 40, items: [{ producto_id: 1, cantidad: 4, nota: null }] }
            };

            it('abre/reutiliza el pedido y agrega cada item con el precio de la BD, vía los services existentes', async () => {
                AbrirPedidoService.execute.mockResolvedValue({ id: 700 });
                ProductRepository.findById.mockResolvedValue({ ...ramen, precio_unidad: 26000 });
                AgregarItemService.execute.mockResolvedValue({ id: 900 });

                const r = await AsistenteToolsService.ejecutar(ctx(), accion);

                expect(AbrirPedidoService.execute).toHaveBeenCalledWith(
                    expect.objectContaining({ tenantId: 5, mesa_id: 40 })
                );
                expect(ProductRepository.findById).toHaveBeenCalledWith(1, 5);
                expect(AgregarItemService.execute).toHaveBeenCalledWith(
                    expect.objectContaining({
                        tenantId: 5,
                        pedidoId: 700,
                        producto_id: 1,
                        cantidad: 4,
                        precio: 26000,
                        modificadores_seleccion: [],
                        puedeUsarModificadores: false
                    })
                );
                expect(r.tipo).toBe('resultado');
                expect(r.datos.mensaje).toContain('Ramen');
            });

            it('vuelve a verificar el permiso al ejecutar (no basta con haber preparado)', async () => {
                const r = await AsistenteToolsService.ejecutar(ctx({ permisos: [] }), accion);
                expect(r.tipo).toBe('error');
                expect(AbrirPedidoService.execute).not.toHaveBeenCalled();
            });

            it('si el producto dejó de estar disponible no lo agrega', async () => {
                AbrirPedidoService.execute.mockResolvedValue({ id: 700 });
                ProductRepository.findById.mockResolvedValue({ ...ramen, disponible: 0 });

                const r = await AsistenteToolsService.ejecutar(ctx(), accion);

                expect(AgregarItemService.execute).not.toHaveBeenCalled();
                expect(r.tipo).toBe('error');
            });

            it('informa agregados y fallidos cuando hay un fallo parcial', async () => {
                AbrirPedidoService.execute.mockResolvedValue({ id: 700 });
                ProductRepository.findById.mockResolvedValueOnce(ramen).mockResolvedValueOnce(burrito);
                AgregarItemService.execute
                    .mockResolvedValueOnce({ id: 1 })
                    .mockRejectedValueOnce(new Error('Pedido no encontrado'));

                const r = await AsistenteToolsService.ejecutar(ctx(), {
                    tool: 'agregar_items',
                    payload: {
                        mesa_id: 40,
                        items: [
                            { producto_id: 1, cantidad: 1, nota: null },
                            { producto_id: 2, cantidad: 1, nota: null }
                        ]
                    }
                });

                expect(r.tipo).toBe('resultado');
                expect(r.datos.mensaje).toContain('Ramen');
                expect(r.datos.mensaje).toContain('Burrito de la Casa');
                expect(r.datos.mensaje).toContain('Pedido no encontrado');
            });

            it('un error interno de base de datos no se filtra al usuario', async () => {
                AbrirPedidoService.execute.mockRejectedValue(
                    Object.assign(new Error("ER_BAD_FIELD_ERROR: Unknown column 'x' in 'field list'"), {
                        code: 'ER_BAD_FIELD_ERROR',
                        sqlMessage: "Unknown column 'x'"
                    })
                );
                const r = await AsistenteToolsService.ejecutar(ctx(), accion);
                expect(r.tipo).toBe('error');
                expect(r.mensaje).not.toMatch(/ER_BAD_FIELD|column/i);
            });

            it('un payload manipulado se rechaza', async () => {
                const r = await AsistenteToolsService.ejecutar(ctx(), {
                    tool: 'agregar_items',
                    payload: { mesa_id: '40; DROP TABLE mesas', items: [{ producto_id: 1, cantidad: 1 }] }
                });
                expect(r.tipo).toBe('error');
                expect(AbrirPedidoService.execute).not.toHaveBeenCalled();
            });

            it('ejecutar solo acepta herramientas de escritura', async () => {
                const r = await AsistenteToolsService.ejecutar(ctx(), { tool: 'ventas_hoy', payload: {} });
                expect(r.tipo).toBe('error');
                expect(StatsRepository.getVentasHoy).not.toHaveBeenCalled();
            });
        });
    });

    describe('cancelar_item', () => {
        const pedidoDetalle = items => ({ pedido: { id: 700 }, items, abonos: [] });

        it('prepara la cancelación de una línea pendiente', async () => {
            AsistenteResolverService.resolverMesa.mockResolvedValue({ estado: 'ok', mesa: mesa4 });
            AsistenteRepository.pedidoAbiertoDeMesa.mockResolvedValue({ id: 700 });
            GetPedidoDetailsService.execute.mockResolvedValue(
                pedidoDetalle([{ id: 31, producto_nombre: 'Ramen', cantidad: 2, estado: 'pendiente' }])
            );

            const r = await AsistenteToolsService.preparar(ctx(), 'cancelar_item', { mesa: '4', producto: 'ramen' });

            expect(GetPedidoDetailsService.execute).toHaveBeenCalledWith({ tenantId: 5, pedidoId: 700 });
            expect(r.tipo).toBe('confirmacion');
            expect(r.accion).toEqual({ tool: 'cancelar_item', payload: { item_id: 31 } });
        });

        it('no cancela líneas que ya salieron a cocina', async () => {
            AsistenteResolverService.resolverMesa.mockResolvedValue({ estado: 'ok', mesa: mesa4 });
            AsistenteRepository.pedidoAbiertoDeMesa.mockResolvedValue({ id: 700 });
            GetPedidoDetailsService.execute.mockResolvedValue(
                pedidoDetalle([{ id: 31, producto_nombre: 'Ramen', cantidad: 2, estado: 'preparando' }])
            );

            const r = await AsistenteToolsService.preparar(ctx(), 'cancelar_item', { mesa: '4', producto: 'ramen' });

            expect(r.tipo).toBe('error');
            expect(r.mensaje).toContain('cocina');
        });

        it('si hay varias líneas del mismo producto no adivina cuál', async () => {
            AsistenteResolverService.resolverMesa.mockResolvedValue({ estado: 'ok', mesa: mesa4 });
            AsistenteRepository.pedidoAbiertoDeMesa.mockResolvedValue({ id: 700 });
            GetPedidoDetailsService.execute.mockResolvedValue(
                pedidoDetalle([
                    { id: 31, producto_nombre: 'Ramen', cantidad: 1, estado: 'pendiente' },
                    { id: 32, producto_nombre: 'Ramen', cantidad: 1, estado: 'pendiente', nota: 'sin huevo' }
                ])
            );

            const r = await AsistenteToolsService.preparar(ctx(), 'cancelar_item', { mesa: '4', producto: 'ramen' });

            expect(r.tipo).toBe('error');
        });

        it('mesa sin pedido abierto: error claro', async () => {
            AsistenteResolverService.resolverMesa.mockResolvedValue({ estado: 'ok', mesa: mesa4 });
            AsistenteRepository.pedidoAbiertoDeMesa.mockResolvedValue(null);

            const r = await AsistenteToolsService.preparar(ctx(), 'cancelar_item', { mesa: '4', producto: 'ramen' });

            expect(r.tipo).toBe('error');
            expect(GetPedidoDetailsService.execute).not.toHaveBeenCalled();
        });

        it('al ejecutar, re-verifica que el item sea del tenant y siga pendiente', async () => {
            AsistenteRepository.itemDelTenant.mockResolvedValueOnce({ id: 31, estado: 'preparando' });
            const noPendiente = await AsistenteToolsService.ejecutar(ctx(), {
                tool: 'cancelar_item',
                payload: { item_id: 31 }
            });
            expect(noPendiente.tipo).toBe('error');
            expect(EliminarItemService.execute).not.toHaveBeenCalled();

            AsistenteRepository.itemDelTenant.mockResolvedValueOnce(null);
            const ajeno = await AsistenteToolsService.ejecutar(ctx(), {
                tool: 'cancelar_item',
                payload: { item_id: 99 }
            });
            expect(ajeno.tipo).toBe('error');
            expect(AsistenteRepository.itemDelTenant).toHaveBeenCalledWith(5, 99);

            AsistenteRepository.itemDelTenant.mockResolvedValueOnce({ id: 31, estado: 'pendiente' });
            EliminarItemService.execute.mockResolvedValue({ message: 'ok' });
            const ok = await AsistenteToolsService.ejecutar(ctx(), { tool: 'cancelar_item', payload: { item_id: 31 } });
            expect(ok.tipo).toBe('resultado');
            expect(EliminarItemService.execute).toHaveBeenCalledWith({ tenantId: 5, itemId: 31, soloPendiente: true });
        });
    });

    describe('liberar_mesa', () => {
        it('prepara y luego ejecuta con LiberarMesaService, pasando los errores de negocio', async () => {
            AsistenteResolverService.resolverMesa.mockResolvedValue({ estado: 'ok', mesa: mesa4 });
            const prep = await AsistenteToolsService.preparar(ctx(), 'liberar_mesa', { mesa: '4' });
            expect(prep.tipo).toBe('confirmacion');
            expect(prep.accion).toEqual({ tool: 'liberar_mesa', payload: { mesa_id: 40 } });
            expect(LiberarMesaService.execute).not.toHaveBeenCalled();

            LiberarMesaService.execute.mockRejectedValueOnce(
                new Error('La mesa tiene items activos, no se puede liberar')
            );
            const fallo = await AsistenteToolsService.ejecutar(ctx(), prep.accion);
            expect(fallo).toEqual({ tipo: 'error', mensaje: 'La mesa tiene items activos, no se puede liberar' });

            LiberarMesaService.execute.mockResolvedValueOnce({ message: 'Mesa liberada' });
            const ok = await AsistenteToolsService.ejecutar(ctx(), prep.accion);
            expect(LiberarMesaService.execute).toHaveBeenLastCalledWith({ tenantId: 5, mesaId: 40 });
            expect(ok.tipo).toBe('resultado');
        });
    });

    describe('liberar_mesas_vacias', () => {
        const vacia = (id, numero, descripcion = null) => ({
            id,
            numero,
            descripcion,
            tipo: 'fisica',
            estado: 'ocupada'
        });

        it('prepara UNA confirmación con la lista y no libera nada todavía', async () => {
            AsistenteRepository.mesasOcupadasSinItems.mockResolvedValue([vacia(30, '3'), vacia(70, 'T1', 'Terraza 1')]);

            const r = await AsistenteToolsService.preparar(ctx(), 'liberar_mesas_vacias', {});

            expect(AsistenteRepository.mesasOcupadasSinItems).toHaveBeenCalledWith(5);
            expect(r.tipo).toBe('confirmacion');
            expect(r.resumen).toContain('mesa 3');
            expect(r.resumen).toContain('mesa T1 (Terraza 1)');
            expect(r.accion).toEqual({ tool: 'liberar_mesas_vacias', payload: { mesa_ids: [30, 70] } });
            expect(LiberarMesaService.execute).not.toHaveBeenCalled();
        });

        it('si no hay mesas ocupadas sin productos lo dice y no pide confirmar', async () => {
            AsistenteRepository.mesasOcupadasSinItems.mockResolvedValue([]);

            const r = await AsistenteToolsService.preparar(ctx(), 'liberar_mesas_vacias', {});

            expect(r.tipo).toBe('resultado');
            expect(r.datos.mensaje).toMatch(/no hay mesas/i);
        });

        it('acota la lista a 30 mesas por confirmación', async () => {
            const muchas = Array.from({ length: 45 }, (_, i) => vacia(i + 1, String(i + 1)));
            AsistenteRepository.mesasOcupadasSinItems.mockResolvedValue(muchas);

            const r = await AsistenteToolsService.preparar(ctx(), 'liberar_mesas_vacias', {});

            expect(r.accion.payload.mesa_ids).toHaveLength(30);
        });

        it('al confirmar libera cada mesa con el servicio de siempre, que vuelve a revisar los items', async () => {
            LiberarMesaService.execute.mockResolvedValue({ message: 'Mesa liberada' });

            const r = await AsistenteToolsService.ejecutar(ctx(), {
                tool: 'liberar_mesas_vacias',
                payload: { mesa_ids: [30, 70] }
            });

            expect(LiberarMesaService.execute).toHaveBeenCalledTimes(2);
            expect(LiberarMesaService.execute).toHaveBeenCalledWith({ tenantId: 5, mesaId: 30 });
            expect(LiberarMesaService.execute).toHaveBeenCalledWith({ tenantId: 5, mesaId: 70 });
            expect(r.tipo).toBe('resultado');
            expect(r.datos.mensaje).toMatch(/2 mesas/);
        });

        it('si una mesa recibió productos entre la lista y el sí, esa se omite y las demás se liberan', async () => {
            LiberarMesaService.execute
                .mockResolvedValueOnce({ message: 'Mesa liberada' })
                .mockRejectedValueOnce(new Error('La mesa tiene items activos, no se puede liberar'));

            const r = await AsistenteToolsService.ejecutar(ctx(), {
                tool: 'liberar_mesas_vacias',
                payload: { mesa_ids: [30, 70] }
            });

            expect(LiberarMesaService.execute).toHaveBeenCalledTimes(2);
            expect(r.tipo).toBe('resultado');
            expect(r.datos.mensaje).toMatch(/1 mesa/);
            expect(r.datos.mensaje).toMatch(/no se liberó/i);
        });

        it('si ninguna se pudo liberar devuelve error', async () => {
            LiberarMesaService.execute.mockRejectedValue(new Error('La mesa tiene items activos, no se puede liberar'));

            const r = await AsistenteToolsService.ejecutar(ctx(), {
                tool: 'liberar_mesas_vacias',
                payload: { mesa_ids: [30] }
            });

            expect(r.tipo).toBe('error');
        });

        it.each([
            [undefined],
            [[]],
            ['30'],
            [[30, '70']],
            [[0]],
            [[1.5]],
            [Array.from({ length: 31 }, (_, i) => i + 1)]
        ])('rechaza una acción con ids inválidos (%p) sin liberar nada', async mesa_ids => {
            const r = await AsistenteToolsService.ejecutar(ctx(), {
                tool: 'liberar_mesas_vacias',
                payload: { mesa_ids }
            });

            expect(r.tipo).toBe('error');
            expect(LiberarMesaService.execute).not.toHaveBeenCalled();
        });

        it('ignora ids repetidos: cada mesa se libera una sola vez', async () => {
            LiberarMesaService.execute.mockResolvedValue({ message: 'Mesa liberada' });

            await AsistenteToolsService.ejecutar(ctx(), {
                tool: 'liberar_mesas_vacias',
                payload: { mesa_ids: [30, 30, 70] }
            });

            expect(LiberarMesaService.execute).toHaveBeenCalledTimes(2);
        });

        it('sin permiso de mesas el modelo no puede usarla', async () => {
            const r = await AsistenteToolsService.preparar(
                ctx({ permisos: ['ventas.ver'] }),
                'liberar_mesas_vacias',
                {}
            );

            expect(r.tipo).toBe('error');
            expect(AsistenteRepository.mesasOcupadasSinItems).not.toHaveBeenCalled();
        });
    });

    describe('herramientas de lectura', () => {
        it('consultar_mesa devuelve items y total sin datos del cliente', async () => {
            AsistenteResolverService.resolverMesa.mockResolvedValue({
                estado: 'ok',
                mesa: { ...mesa4, estado: 'ocupada' }
            });
            AsistenteRepository.pedidoAbiertoDeMesa.mockResolvedValue({ id: 700 });
            GetPedidoDetailsService.execute.mockResolvedValue({
                pedido: { id: 700, cliente_id: 3, cliente_nombre: 'Ana Pérez', estado: 'abierto' },
                items: [
                    {
                        id: 1,
                        producto_nombre: 'Ramen',
                        cantidad: 2,
                        estado: 'pendiente',
                        subtotal: 50000,
                        nota: 'sin cebolla'
                    },
                    { id: 2, producto_nombre: 'Té', cantidad: 1, estado: 'cancelado', subtotal: 5000 }
                ],
                abonos: [{ monto: 10000 }]
            });

            const r = await AsistenteToolsService.preparar(ctx(), 'consultar_mesa', { mesa: 'cuatro' });

            expect(r.tipo).toBe('resultado');
            expect(r.datos.items).toHaveLength(1);
            expect(r.datos.total).toBe(50000);
            expect(r.datos.abonado).toBe(10000);
            expect(JSON.stringify(r)).not.toMatch(/Ana|cliente/i);
        });

        it('consultar_mesa sin pedido abierto lo dice', async () => {
            AsistenteResolverService.resolverMesa.mockResolvedValue({ estado: 'ok', mesa: mesa4 });
            AsistenteRepository.pedidoAbiertoDeMesa.mockResolvedValue(null);

            const r = await AsistenteToolsService.preparar(ctx(), 'consultar_mesa', { mesa: '4' });

            expect(r.tipo).toBe('resultado');
            expect(r.datos.pedido_abierto).toBe(false);
        });

        it('mesas_libres lista solo las libres del tenant', async () => {
            AsistenteRepository.listarMesas.mockResolvedValue([
                { id: 1, numero: '1', descripcion: null, estado: 'libre' },
                { id: 2, numero: '2', descripcion: 'Barra', estado: 'ocupada' },
                { id: 3, numero: '3', descripcion: 'Terraza', estado: 'libre' }
            ]);

            const r = await AsistenteToolsService.preparar(ctx(), 'mesas_libres', {});

            expect(AsistenteRepository.listarMesas).toHaveBeenCalledWith(5);
            expect(r.datos.total).toBe(2);
            expect(r.datos.mesas).toEqual(['mesa 1', 'mesa 3 (Terraza)']);
        });

        it('estado_mesas resume TODAS las mesas del tenant: total, libres y ocupadas con sus conteos', async () => {
            AsistenteRepository.listarMesas.mockResolvedValue([
                { id: 1, numero: '1', descripcion: null, estado: 'libre' },
                { id: 2, numero: '2', descripcion: 'Barra', estado: 'ocupada' },
                { id: 3, numero: '3', descripcion: 'Terraza', estado: 'libre' },
                { id: 4, numero: '4', descripcion: null, estado: 'ocupada' },
                { id: 5, numero: 'D', descripcion: 'Domicilio', estado: 'ocupada' },
                { id: 6, numero: '6', descripcion: null, estado: 'reservada' }
            ]);

            const r = await AsistenteToolsService.preparar(ctx(), 'estado_mesas', {});

            expect(AsistenteRepository.listarMesas).toHaveBeenCalledWith(5);
            expect(r.tipo).toBe('resultado');
            expect(r.datos.total).toBe(6);
            expect(r.datos.libres).toEqual({ cantidad: 2, mesas: ['mesa 1', 'mesa 3 (Terraza)'] });
            expect(r.datos.ocupadas).toEqual({
                cantidad: 3,
                mesas: ['mesa 2 (Barra)', 'mesa 4', 'mesa D (Domicilio)']
            });
            expect(r.datos.otras).toEqual({ cantidad: 1, mesas: ['mesa 6'] });
        });

        it('estado_mesas sin mesas devuelve ceros, sin inventar nada', async () => {
            AsistenteRepository.listarMesas.mockResolvedValue([]);

            const r = await AsistenteToolsService.preparar(ctx(), 'estado_mesas', {});

            expect(r.datos.total).toBe(0);
            expect(r.datos.libres.cantidad).toBe(0);
            expect(r.datos.ocupadas.cantidad).toBe(0);
        });

        it('estado_mesas exige el permiso y el módulo de mesas como el resto', async () => {
            const sinPermiso = await AsistenteToolsService.preparar(
                ctx({ permisos: ['ventas.ver'] }),
                'estado_mesas',
                {}
            );

            expect(sinPermiso.tipo).toBe('error');
            expect(AsistenteRepository.listarMesas).not.toHaveBeenCalled();
        });

        it('consultar_menu devuelve precio y disponibilidad, y las coincidencias si es ambiguo', async () => {
            AsistenteResolverService.resolverProducto.mockResolvedValueOnce({ estado: 'ok', producto: ramen });
            const uno = await AsistenteToolsService.preparar(ctx(), 'consultar_menu', { producto: 'ramen' });
            expect(uno.datos.coincidencias).toEqual([{ nombre: 'Ramen', precio: 25000, disponible: true }]);

            AsistenteResolverService.resolverProducto.mockResolvedValueOnce({
                estado: 'ambigua',
                candidatas: [burrito, ramen]
            });
            const varios = await AsistenteToolsService.preparar(ctx(), 'consultar_menu', { producto: 'a' });
            expect(varios.datos.coincidencias).toHaveLength(2);

            AsistenteResolverService.resolverProducto.mockResolvedValueOnce({
                estado: 'sin_coincidencia',
                candidatas: []
            });
            const ninguno = await AsistenteToolsService.preparar(ctx(), 'consultar_menu', { producto: 'zzz' });
            expect(ninguno.tipo).toBe('error');
        });

        it('ventas_hoy usa el tenant de la sesión', async () => {
            StatsRepository.getVentasHoy.mockResolvedValue({ total: 350000, cantidad: 12 });

            const r = await AsistenteToolsService.preparar(ctx(), 'ventas_hoy', {});

            expect(StatsRepository.getVentasHoy).toHaveBeenCalledWith(5);
            expect(r.datos).toEqual({ total: 350000, cantidad_ventas: 12 });
        });

        it('ejecutar jamás corre una herramienta de lectura con un payload inventado', async () => {
            const r = await AsistenteToolsService.ejecutar(ctx(), { tool: 'mesas_libres', payload: {} });
            expect(r.tipo).toBe('error');
        });
    });
});
