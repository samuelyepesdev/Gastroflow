/**
 * ComboService + expansión de combos en InventarioService.
 * Los repositorios se mockean: nunca toca una BD real.
 */

jest.mock('../../../config/database', () => ({ query: jest.fn(), getConnection: jest.fn() }));
jest.mock('../../../repositories/Tenant/ComboRepository');
jest.mock('../../../repositories/Tenant/RecetaRepository');
jest.mock('../../../repositories/Tenant/InsumoRepository');
jest.mock('../../../repositories/Tenant/MovimientoInventarioRepository');
jest.mock('../../../services/Tenant/ProductService');

const ComboRepository = require('../../../repositories/Tenant/ComboRepository');
const ProductService = require('../../../services/Tenant/ProductService');
const ComboService = require('../../../services/Tenant/ComboService');
const InventarioService = require('../../../services/Tenant/InventarioService');

const TENANT = 7;
const datosValidos = {
    nombre: 'Combo hamburguesa',
    precio_unidad: 25000,
    categoria_id: 3,
    componentes: [
        { producto_id: 10, cantidad: 1 },
        { producto_id: 20, cantidad: 2 }
    ]
};

describe('ComboService.crear', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        ComboRepository.findProductosSimples.mockImplementation(async ids => ids);
        ProductService.create.mockResolvedValue({ id: 99 });
        ProductService.update.mockResolvedValue({});
        ComboRepository.setComponentes.mockResolvedValue();
    });

    it('crea el producto, le pone código CMB-<id> y guarda los componentes', async () => {
        const res = await ComboService.crear(TENANT, datosValidos, 5);

        expect(res.id).toBe(99);
        expect(ProductService.create).toHaveBeenCalledWith(
            TENANT,
            expect.objectContaining({ nombre: 'Combo hamburguesa', precio_unidad: 25000, categoria_id: 3 }),
            5
        );
        expect(ProductService.update).toHaveBeenCalledWith(
            99,
            TENANT,
            expect.objectContaining({ codigo: 'CMB-99' }),
            5
        );
        expect(ComboRepository.setComponentes).toHaveBeenCalledWith(99, TENANT, [
            { producto_id: 10, cantidad: 1 },
            { producto_id: 20, cantidad: 2 }
        ]);
    });

    it('suma la cantidad si el mismo producto viene repetido', async () => {
        await ComboService.crear(
            TENANT,
            {
                ...datosValidos,
                componentes: [
                    { producto_id: 10, cantidad: 1 },
                    { producto_id: 10, cantidad: 2 }
                ]
            },
            null
        );
        expect(ComboRepository.setComponentes).toHaveBeenCalledWith(99, TENANT, [{ producto_id: 10, cantidad: 3 }]);
    });

    it.each([
        ['sin nombre', { nombre: '  ' }, /nombre/],
        ['precio 0', { precio_unidad: 0 }, /precio/],
        ['sin categoría', { categoria_id: null }, /categoría/],
        ['sin productos', { componentes: [] }, /al menos un producto/],
        ['cantidad 0', { componentes: [{ producto_id: 10, cantidad: 0 }] }, /cantidad/]
    ])('rechaza un combo %s', async (_caso, cambio, mensaje) => {
        await expect(ComboService.crear(TENANT, { ...datosValidos, ...cambio })).rejects.toThrow(mensaje);
        expect(ProductService.create).not.toHaveBeenCalled();
    });

    it('rechaza componentes que no existen o son otro combo', async () => {
        ComboRepository.findProductosSimples.mockResolvedValue([10]); // 20 no es válido
        await expect(ComboService.crear(TENANT, datosValidos)).rejects.toThrow(/no existe o es otro combo/);
        expect(ProductService.create).not.toHaveBeenCalled();
    });
});

describe('ComboService.actualizar / eliminar', () => {
    beforeEach(() => jest.resetAllMocks());

    it('falla si el combo no existe', async () => {
        ComboRepository.findById.mockResolvedValue(null);
        await expect(ComboService.actualizar(1, TENANT, datosValidos)).rejects.toThrow('Combo no encontrado');
        await expect(ComboService.eliminar(1, TENANT)).rejects.toThrow('Combo no encontrado');
    });

    it('actualizar conserva el código, imagen e impuesto del combo', async () => {
        ComboRepository.findById.mockResolvedValue({
            id: 4,
            codigo: 'CMB-4',
            imagen_url: '/img/x.png',
            tributo: 'iva_19',
            tasa_impuesto: 19
        });
        ComboRepository.findProductosSimples.mockImplementation(async ids => ids);
        ProductService.update.mockResolvedValue({});

        await ComboService.actualizar(4, TENANT, datosValidos, 5);

        expect(ProductService.update).toHaveBeenCalledWith(
            4,
            TENANT,
            expect.objectContaining({
                codigo: 'CMB-4',
                imagen_url: '/img/x.png',
                tributo: 'iva_19',
                tasa_impuesto: 19
            }),
            5
        );
        expect(ComboRepository.setComponentes).toHaveBeenCalled();
    });

    it('eliminar hace borrado lógico del producto', async () => {
        ComboRepository.findById.mockResolvedValue({ id: 4 });
        ProductService.delete.mockResolvedValue({ message: 'ok' });
        await ComboService.eliminar(4, TENANT, 5);
        expect(ProductService.delete).toHaveBeenCalledWith(4, TENANT, 5);
    });
});

describe('InventarioService con combos', () => {
    beforeEach(() => jest.resetAllMocks());

    it('descontarPorReceta descuenta la receta de cada componente x cantidad del combo', async () => {
        ComboRepository.getComponentes.mockResolvedValue([
            { producto_id: 10, cantidad: '1.00' },
            { producto_id: 20, cantidad: '2.00' }
        ]);
        const spy = jest.spyOn(InventarioService, '_descontarRecetaProducto').mockResolvedValue();

        await InventarioService.descontarPorReceta(TENANT, 99, 3, 'factura_1');

        expect(spy).toHaveBeenCalledTimes(2);
        expect(spy).toHaveBeenCalledWith(TENANT, 10, 3, 'factura_1');
        expect(spy).toHaveBeenCalledWith(TENANT, 20, 6, 'factura_1');
        spy.mockRestore();
    });

    it('un producto que no es combo sigue descontando su propia receta', async () => {
        ComboRepository.getComponentes.mockResolvedValue([]);
        const spy = jest.spyOn(InventarioService, '_descontarRecetaProducto').mockResolvedValue();

        await InventarioService.descontarPorReceta(TENANT, 10, 2, 'factura_1');

        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith(TENANT, 10, 2, 'factura_1');
        spy.mockRestore();
    });

    it('checkStockParaProducto junta los faltantes de todos los componentes', async () => {
        ComboRepository.getComponentes.mockResolvedValue([
            { producto_id: 10, cantidad: '1.00' },
            { producto_id: 20, cantidad: '2.00' }
        ]);
        const spy = jest
            .spyOn(InventarioService, '_checkStockReceta')
            .mockResolvedValueOnce({ ok: true })
            .mockResolvedValueOnce({ ok: false, faltantes: [{ insumo_nombre: 'Pan' }] });

        const res = await InventarioService.checkStockParaProducto(TENANT, 99, 2);

        expect(spy).toHaveBeenNthCalledWith(1, TENANT, 10, 2);
        expect(spy).toHaveBeenNthCalledWith(2, TENANT, 20, 4);
        expect(res).toEqual({ ok: false, faltantes: [{ insumo_nombre: 'Pan' }] });
        spy.mockRestore();
    });
});
