jest.mock('../../../services/Tenant/FinanzasService', () => ({
    registrarIngresoVenta: jest.fn().mockResolvedValue(1)
}));
jest.mock('../../../services/Tenant/InventarioService', () => ({
    descontarPorCombosFactura: jest.fn().mockResolvedValue(),
    descontarProductosLote: jest.fn().mockResolvedValue(),
    descontarPorModificadoresFactura: jest.fn().mockResolvedValue()
}));
jest.mock('../../../services/Tenant/FidelizacionService', () => ({ sellarPorFactura: jest.fn().mockResolvedValue() }));
jest.mock('../../../services/Tenant/FacturacionElectronicaConfigService', () => ({
    encolarSiActivo: jest.fn().mockResolvedValue()
}));
jest.mock('../../../repositories/Tenant/InsumoRepository', () => ({ findByIds: jest.fn() }));
jest.mock('../../../repositories/Tenant/ProductRepository', () => ({ findByIds: jest.fn() }));
jest.mock('../../../services/Shared/CacheService', () => ({ deleteByPrefix: jest.fn(), delete: jest.fn() }));

const FinanzasService = require('../../../services/Tenant/FinanzasService');
const InventarioService = require('../../../services/Tenant/InventarioService');
const FidelizacionService = require('../../../services/Tenant/FidelizacionService');
const FacturacionElectronicaConfigService = require('../../../services/Tenant/FacturacionElectronicaConfigService');
const InsumoRepository = require('../../../repositories/Tenant/InsumoRepository');
const ProductRepository = require('../../../repositories/Tenant/ProductRepository');
const cacheService = require('../../../services/Shared/CacheService');
const PostVentaService = require('../../../services/Tenant/Facturacion/PostVentaService');

const CONN = { id: 'conexion-de-la-venta' };

beforeEach(() => {
    jest.clearAllMocks();
    InsumoRepository.findByIds.mockResolvedValue(new Map());
    ProductRepository.findByIds.mockResolvedValue(new Map());
});

describe('PostVentaService.detectarCeramica', () => {
    test('por nombre de la línea (sin consultar nada más para decidir)', async () => {
        expect(await PostVentaService.detectarCeramica(1, [{ producto_id: 5, nombre: 'Taza Cerámica azul' }])).toBe(
            true
        );
    });

    test('producto real cuya categoría es Cerámicas', async () => {
        ProductRepository.findByIds.mockResolvedValue(
            new Map([[5, { nombre: 'Plato', categoria_nombre: 'Cerámicas' }]])
        );
        expect(await PostVentaService.detectarCeramica(1, [{ producto_id: 5, nombre: 'Plato' }])).toBe(true);
    });

    test('insumo virtual (id >= 1.000.000): busca el insumo real, no el producto', async () => {
        InsumoRepository.findByIds.mockResolvedValue(
            new Map([[25, { nombre: 'Jarrón', categoria_nombre: 'Cerámicas' }]])
        );
        expect(await PostVentaService.detectarCeramica(1, [{ producto_id: 1000025 }])).toBe(true);
        expect(InsumoRepository.findByIds).toHaveBeenCalledWith([25], 1, null);
        expect(ProductRepository.findByIds).toHaveBeenCalledWith([], 1, null);
    });

    test('con la conexión de la venta, las dos lecturas van por ELLA y no por el pool', async () => {
        await PostVentaService.detectarCeramica(1, [{ producto_id: 1000025 }, { producto_id: 7 }], CONN);
        expect(InsumoRepository.findByIds).toHaveBeenCalledWith([25], 1, CONN);
        expect(ProductRepository.findByIds).toHaveBeenCalledWith([7], 1, CONN);
    });

    test('productos normales y servicios: no es cerámica', async () => {
        ProductRepository.findByIds.mockResolvedValue(new Map([[5, { nombre: 'Café', categoria_nombre: 'Bebidas' }]]));
        expect(
            await PostVentaService.detectarCeramica(1, [
                { producto_id: 5, nombre: 'Café' },
                { es_servicio: true, servicio_id: 3 }
            ])
        ).toBe(false);
    });

    test('si falla la consulta se asume que no es cerámica (el ingreso igual se registra)', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
        ProductRepository.findByIds.mockRejectedValue(new Error('db'));
        expect(await PostVentaService.detectarCeramica(1, [{ producto_id: 5 }])).toBe(false);
    });
});

describe('PostVentaService.registrarEfectosEnTransaccion', () => {
    const datos = {
        tenantId: 1,
        facturaId: 33,
        lineas: [
            { producto_id: 7, cantidad: 2 },
            { es_servicio: true, servicio_id: 4, cantidad: 1 }
        ],
        total: 20000,
        usuarioId: 8,
        fecha: null
    };

    test('ingreso e inventario con LA conexión de la venta, en el orden de siempre', async () => {
        const orden = [];
        FinanzasService.registrarIngresoVenta.mockImplementation(async () => orden.push('finanzas'));
        InventarioService.descontarProductosLote.mockImplementation(async () => orden.push('recetas'));
        InventarioService.descontarPorModificadoresFactura.mockImplementation(async () => orden.push('toppings'));

        await PostVentaService.registrarEfectosEnTransaccion(CONN, datos);

        expect(FinanzasService.registrarIngresoVenta).toHaveBeenCalledWith(
            1,
            expect.objectContaining({ monto: 20000, factura_id: 33, usuario_id: 8, esCeramica: false, conn: CONN })
        );
        expect(InventarioService.descontarProductosLote).toHaveBeenCalledWith(
            1,
            [{ producto_id: 7, cantidad: 2 }], // el servicio no descuenta inventario
            'factura_33',
            CONN
        );
        expect(InventarioService.descontarPorModificadoresFactura).toHaveBeenCalledWith(1, 33, CONN);
        expect(InventarioService.descontarPorCombosFactura).not.toHaveBeenCalled();
        expect(orden).toEqual(['finanzas', 'recetas', 'toppings']);
    });

    test('con combos armados descuenta primero los combos', async () => {
        const orden = [];
        InventarioService.descontarPorCombosFactura.mockImplementation(async () => orden.push('combos'));
        InventarioService.descontarProductosLote.mockImplementation(async () => orden.push('recetas'));
        await PostVentaService.registrarEfectosEnTransaccion(CONN, {
            ...datos,
            lineas: [{ combo_id: 9, cantidad: 1 }]
        });
        expect(InventarioService.descontarPorCombosFactura).toHaveBeenCalledWith(1, 33, CONN);
        expect(orden).toEqual(['combos', 'recetas']);
    });

    test('venta de evento de otro día: pasa la fecha a finanzas', async () => {
        await PostVentaService.registrarEfectosEnTransaccion(CONN, { ...datos, fecha: '2026-11-01' });
        expect(FinanzasService.registrarIngresoVenta.mock.calls[0][1].fecha).toBe('2026-11-01');
    });

    test('un fallo de finanzas o de inventario se propaga (la venta se revierte)', async () => {
        FinanzasService.registrarIngresoVenta.mockRejectedValueOnce(new Error('finanzas caída'));
        await expect(PostVentaService.registrarEfectosEnTransaccion(CONN, datos)).rejects.toThrow('finanzas caída');
        expect(InventarioService.descontarProductosLote).not.toHaveBeenCalled();

        InventarioService.descontarProductosLote.mockRejectedValueOnce(new Error('insumos caída'));
        await expect(PostVentaService.registrarEfectosEnTransaccion(CONN, datos)).rejects.toThrow('insumos caída');
    });
});

describe('PostVentaService.ejecutarEfectosPostCommit', () => {
    const datos = { tenantId: 1, facturaId: 33, clienteId: 10, total: 20000, usuarioId: 8 };

    test('encola la factura electrónica, sella la tarjeta e invalida la caché', async () => {
        await PostVentaService.ejecutarEfectosPostCommit(datos);
        expect(FacturacionElectronicaConfigService.encolarSiActivo).toHaveBeenCalledWith(33, 1);
        expect(FidelizacionService.sellarPorFactura).toHaveBeenCalledWith({
            tenantId: 1,
            facturaId: 33,
            clienteId: 10,
            total: 20000,
            usuarioId: 8
        });
        expect(cacheService.deleteByPrefix).toHaveBeenCalledWith('tenant_dashboard_stats_1');
        expect(cacheService.delete).toHaveBeenCalledWith('superadmin_dashboard_stats');
    });

    test('NUNCA lanza: un fallo de la factura electrónica no impide el sello ni la caché', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
        FacturacionElectronicaConfigService.encolarSiActivo.mockRejectedValueOnce(new Error('dian caída'));
        cacheService.deleteByPrefix.mockImplementationOnce(() => {
            throw new Error('cache');
        });
        await expect(PostVentaService.ejecutarEfectosPostCommit(datos)).resolves.toBeUndefined();
        expect(FidelizacionService.sellarPorFactura).toHaveBeenCalled();
    });
});
