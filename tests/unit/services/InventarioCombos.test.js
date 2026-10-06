/**
 * InventarioService con combos armados: faltantes de stock y descuento por selección.
 * Repositorios mockeados.
 */

jest.mock('../../../config/database', () => ({ query: jest.fn(), getConnection: jest.fn() }));
jest.mock('../../../repositories/Tenant/ComboVentaRepository');
jest.mock('../../../repositories/Tenant/ComboRepository');
jest.mock('../../../repositories/Tenant/RecetaRepository');
jest.mock('../../../repositories/Tenant/InsumoRepository');
jest.mock('../../../repositories/Tenant/MovimientoInventarioRepository');

const ComboVentaRepository = require('../../../repositories/Tenant/ComboVentaRepository');
const InventarioService = require('../../../services/Tenant/InventarioService');

const TENANT = 7;

describe('InventarioService.descontarPorCombosFactura', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        jest.resetAllMocks();
    });

    it('descuenta la receta de cada selección x cantidad por combo x combos vendidos', async () => {
        ComboVentaRepository.getSeleccionesPorFactura.mockResolvedValue([
            { producto_id: 10, cantidad_por_combo: '1.00', cantidad_combo: '3.00' },
            { producto_id: 21, cantidad_por_combo: '2.00', cantidad_combo: '3.00' }
        ]);
        const descontar = jest.spyOn(InventarioService, 'descontarPorReceta').mockResolvedValue();

        await InventarioService.descontarPorCombosFactura(TENANT, 900);

        expect(descontar).toHaveBeenCalledWith(TENANT, 10, 3, 'factura_900');
        expect(descontar).toHaveBeenCalledWith(TENANT, 21, 6, 'factura_900');
    });

    it('un fallo no tumba la venta (best-effort)', async () => {
        ComboVentaRepository.getSeleccionesPorFactura.mockRejectedValue(new Error('db'));
        const log = jest.spyOn(console, 'error').mockImplementation(() => {});

        await expect(InventarioService.descontarPorCombosFactura(TENANT, 900)).resolves.toBeUndefined();
        expect(log).toHaveBeenCalled();
    });
});

describe('InventarioService.checkStockParaSelecciones', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        jest.resetAllMocks();
    });

    it('revisa cada producto elegido con cantidad x combos y junta los faltantes', async () => {
        const check = jest.spyOn(InventarioService, 'checkStockParaProducto');
        check.mockResolvedValueOnce({ ok: true });
        check.mockResolvedValueOnce({
            ok: false,
            faltantes: [{ insumo_nombre: 'Gaseosa', requerido: 4, unidad_base: 'UND', disponible: 1 }]
        });

        const res = await InventarioService.checkStockParaSelecciones(
            TENANT,
            [
                { producto_id: 10, cantidad: 1 },
                { producto_id: 21, cantidad: 2 }
            ],
            2
        );

        expect(check).toHaveBeenNthCalledWith(1, TENANT, 10, 2);
        expect(check).toHaveBeenNthCalledWith(2, TENANT, 21, 4);
        expect(res.ok).toBe(false);
        expect(res.faltantes).toHaveLength(1);
    });

    it('ok cuando todo alcanza', async () => {
        jest.spyOn(InventarioService, 'checkStockParaProducto').mockResolvedValue({ ok: true });

        await expect(
            InventarioService.checkStockParaSelecciones(TENANT, [{ producto_id: 10, cantidad: 1 }])
        ).resolves.toEqual({ ok: true, faltantes: [] });
    });
});
