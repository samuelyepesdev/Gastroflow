/**
 * FacturaService.create con líneas de combo armado (POS): resolución contra el catálogo,
 * validación de stock de lo elegido y descuento de inventario. Dependencias mockeadas.
 */

jest.mock('../../../services/Tenant/TenantOwnership', () => ({
    clientes: jest.fn().mockResolvedValue(),
    productos: jest.fn().mockResolvedValue(),
    servicios: jest.fn().mockResolvedValue(),
    eventos: jest.fn().mockResolvedValue()
}));
jest.mock('../../../repositories/Tenant/FacturaRepository', () => ({ createWithDetails: jest.fn() }));
jest.mock('../../../services/Tenant/InventarioService', () => ({
    checkStockParaProducto: jest.fn().mockResolvedValue({ ok: true }),
    checkStockParaSelecciones: jest.fn().mockResolvedValue({ ok: true, faltantes: [] }),
    descontarPorReceta: jest.fn().mockResolvedValue(),
    descontarPorCombosFactura: jest.fn().mockResolvedValue(),
    descontarPorModificadoresFactura: jest.fn().mockResolvedValue()
}));
jest.mock('../../../services/Tenant/ComboArmableService', () => ({ resolverLineaVenta: jest.fn() }));
jest.mock('../../../services/Tenant/ModificadorService', () => ({
    validarYCalcularSeleccion: jest.fn().mockResolvedValue({ precioAdicionalTotal: 0, lineasSnapshot: [] })
}));
jest.mock('../../../services/Tenant/Mesas/AgregarItemService', () => ({ _getOrCreateMirrorProduct: jest.fn() }));
jest.mock('../../../services/Tenant/FinanzasService', () => ({ registrarIngresoVenta: jest.fn().mockResolvedValue() }));
jest.mock('../../../repositories/Tenant/InsumoRepository', () => ({
    findByIds: jest.fn().mockResolvedValue(new Map())
}));
jest.mock('../../../repositories/Tenant/ProductRepository', () => ({
    findByIds: jest.fn().mockResolvedValue(new Map())
}));
jest.mock('../../../services/Tenant/FacturacionElectronicaConfigService', () => ({
    encolarSiActivo: jest.fn().mockResolvedValue()
}));
jest.mock('../../../services/Shared/CacheService', () => ({ deleteByPrefix: jest.fn(), delete: jest.fn() }));

const FacturaRepository = require('../../../repositories/Tenant/FacturaRepository');
const InventarioService = require('../../../services/Tenant/InventarioService');
const ComboArmableService = require('../../../services/Tenant/ComboArmableService');
const FacturaService = require('../../../services/Tenant/FacturaService');

const TENANT = 7;
const resuelto = {
    combo_id: 50,
    producto_id: null,
    es_servicio: false,
    nombre: 'Combo Burger',
    cantidad: 2,
    precio: 22000,
    precio_original: 22000,
    subtotal: 44000,
    _comboSelecciones: [
        { combo_opcion_id: 1, producto_id: 10, grupo_nombre: 'Plato', producto_nombre: 'Burger', cantidad: 1 }
    ]
};

describe('FacturaService.create con combo armado', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        FacturaRepository.createWithDetails.mockResolvedValue({ insertId: 900, numero: 12 });
        ComboArmableService.resolverLineaVenta.mockResolvedValue(resuelto);
        InventarioService.checkStockParaSelecciones.mockResolvedValue({ ok: true, faltantes: [] });
    });

    const datos = productos => ({ cliente_id: 1, total: 44000, forma_pago: 'efectivo', productos });

    it('resuelve la línea contra el catálogo y la pasa al repositorio sin producto', async () => {
        const res = await FacturaService.create(
            TENANT,
            datos([{ combo_id: 50, selecciones: [{ opcion_id: 1 }], cantidad: 2, precio: 1, subtotal: 2 }])
        );

        expect(res).toEqual({ id: 900, numero: 12 });
        expect(ComboArmableService.resolverLineaVenta).toHaveBeenCalledWith(
            TENANT,
            expect.objectContaining({ combo_id: 50 })
        );
        const enviado = FacturaRepository.createWithDetails.mock.calls[0][1].productos[0];
        expect(enviado).toMatchObject({ combo_id: 50, producto_id: null, precio: 22000, subtotal: 44000 });
    });

    it('descuenta el inventario de lo elegido solo cuando hay combos', async () => {
        await FacturaService.create(TENANT, datos([{ combo_id: 50, selecciones: [], cantidad: 2 }]));

        expect(InventarioService.descontarPorCombosFactura).toHaveBeenCalledWith(TENANT, 900);
    });

    it('una venta sin combos no toca la lógica de combos', async () => {
        await FacturaService.create(TENANT, datos([{ producto_id: 10, cantidad: 1, precio: 5000, subtotal: 5000 }]));

        expect(ComboArmableService.resolverLineaVenta).not.toHaveBeenCalled();
        expect(InventarioService.descontarPorCombosFactura).not.toHaveBeenCalled();
    });

    it('bloquea la venta si falta stock de algo elegido (igual que con un producto)', async () => {
        InventarioService.checkStockParaSelecciones.mockResolvedValue({
            ok: false,
            faltantes: [{ insumo_nombre: 'Pan', requerido: 4, unidad_base: 'UND', disponible: 1 }]
        });

        await expect(
            FacturaService.create(TENANT, datos([{ combo_id: 50, selecciones: [], cantidad: 2 }]))
        ).rejects.toThrow(/No hay stock suficiente.*Pan/);
        expect(FacturaRepository.createWithDetails).not.toHaveBeenCalled();
    });

    it('una selección inválida aborta antes de facturar', async () => {
        ComboArmableService.resolverLineaVenta.mockRejectedValue(new Error('Elige una opción en "Bebida"'));

        await expect(
            FacturaService.create(TENANT, datos([{ combo_id: 50, selecciones: [], cantidad: 1 }]))
        ).rejects.toThrow(/Bebida/);
        expect(FacturaRepository.createWithDetails).not.toHaveBeenCalled();
    });

    it('mezcla combos y productos en la misma factura', async () => {
        await FacturaService.create(
            TENANT,
            datos([
                { combo_id: 50, selecciones: [], cantidad: 2 },
                { producto_id: 10, cantidad: 1, precio: 5000, subtotal: 5000 }
            ])
        );

        const enviados = FacturaRepository.createWithDetails.mock.calls[0][1].productos;
        expect(enviados[0].combo_id).toBe(50);
        expect(enviados[1]).toMatchObject({ producto_id: 10 });
        expect(InventarioService.checkStockParaProducto).toHaveBeenCalledWith(TENANT, 10, 1);
    });
});
