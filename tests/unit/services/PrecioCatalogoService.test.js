jest.mock('../../../config/database', () => ({ query: jest.fn() }));
jest.mock('../../../services/Tenant/PromocionService', () => ({
    getDescuentoPorProductos: jest.fn().mockResolvedValue(new Map()),
    calcularDescuento: jest.fn((promo, precio) =>
        promo.valor_tipo === 'porcentaje' ? (precio * promo.valor) / 100 : promo.valor
    )
}));

const db = require('../../../config/database');
const PromocionService = require('../../../services/Tenant/PromocionService');
const PrecioCatalogoService = require('../../../services/Tenant/PrecioCatalogoService');

const verificar = (productos, total, permiso = false) =>
    PrecioCatalogoService.exigirSinDescuentoNoAutorizado(1, productos, total, permiso);

describe('PrecioCatalogoService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        PromocionService.getDescuentoPorProductos.mockResolvedValue(new Map());
        db.query.mockImplementation(async sql =>
            sql.includes('FROM productos')
                ? [[{ id: 7, precio_unidad: 10000, categoria_id: 2 }]]
                : [[{ id: 3, precio: 5000 }]]
        );
    });

    test('con permiso no consulta nada y deja pasar cualquier descuento', async () => {
        await verificar([{ producto_id: 7, cantidad: 1, subtotal: 1 }], 1, true);
        expect(db.query).not.toHaveBeenCalled();
    });

    test('precio de catálogo exacto pasa; con toppings sumados también', async () => {
        await verificar([{ producto_id: 7, cantidad: 2, subtotal: 20000 }], 20000);
        await verificar([{ producto_id: 7, cantidad: 2, subtotal: 22000, _precioAdicional: 1000 }], 22000);
    });

    test('cobrar más que el catálogo no es un descuento', async () => {
        await verificar([{ producto_id: 7, cantidad: 1, subtotal: 12000 }], 12000);
    });

    test('un subtotal menor al catálogo sin permiso se rechaza con 403', async () => {
        await expect(verificar([{ producto_id: 7, cantidad: 1, subtotal: 8000 }], 8000)).rejects.toMatchObject({
            status: 403,
            codigo: 'DESCUENTO_NO_AUTORIZADO'
        });
    });

    test('un total menor a la suma de líneas se rechaza aunque las líneas estén bien', async () => {
        await expect(verificar([{ producto_id: 7, cantidad: 1, subtotal: 10000 }], 1)).rejects.toMatchObject({
            status: 403
        });
    });

    test('la promoción vigente calculada en el servidor sí se acepta sin permiso', async () => {
        PromocionService.getDescuentoPorProductos.mockResolvedValue(
            new Map([[7, { valor_tipo: 'porcentaje', valor: 10 }]])
        );
        await verificar([{ producto_id: 7, cantidad: 1, subtotal: 9000 }], 9000);
        await expect(verificar([{ producto_id: 7, cantidad: 1, subtotal: 8000 }], 8000)).rejects.toMatchObject({
            status: 403
        });
    });

    test('servicios y combos también se comparan con su precio de lista', async () => {
        await verificar([{ es_servicio: true, servicio_id: 3, cantidad: 2, subtotal: 10000 }], 10000);
        await expect(
            verificar([{ es_servicio: true, servicio_id: 3, cantidad: 2, subtotal: 100 }], 100)
        ).rejects.toMatchObject({ status: 403 });
        await verificar([{ combo_id: 9, cantidad: 1, precio_original: 20000, subtotal: 20000 }], 20000);
        await expect(
            verificar([{ combo_id: 9, cantidad: 1, precio_original: 20000, subtotal: 5000 }], 5000)
        ).rejects.toMatchObject({ status: 403 });
    });
});
