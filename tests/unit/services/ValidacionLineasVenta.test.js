jest.mock('../../../config/database', () => ({ query: jest.fn() }));
jest.mock('../../../services/Tenant/TenantOwnership', () => ({
    clientes: jest.fn().mockResolvedValue(),
    productos: jest.fn().mockResolvedValue(),
    servicios: jest.fn().mockResolvedValue(),
    eventos: jest.fn().mockResolvedValue(),
    insumos: jest.fn().mockResolvedValue()
}));
jest.mock('../../../services/Shared/RealtimeEvents', () => ({ emitPedido: jest.fn() }));

const db = require('../../../config/database');
const AgregarServicioService = require('../../../services/Tenant/Mesas/AgregarServicioService');
const AgregarItemService = require('../../../services/Tenant/Mesas/AgregarItemService');
const FacturaService = require('../../../services/Tenant/FacturaService');
const { exigirCantidad, exigirMonto, validarLineas } = require('../../../utils/validacionLineas');

describe('validacionLineas', () => {
    test.each([-1, 0, NaN, Infinity, 'abc', '', null, undefined, true])('cantidad %p se rechaza', v => {
        expect(() => exigirCantidad(v)).toThrow(/mayor que 0/);
    });

    test('cantidad válida admite decimales y strings numéricos', () => {
        expect(exigirCantidad(2)).toBe(2);
        expect(exigirCantidad('0.5')).toBe(0.5);
    });

    test.each([-0.01, NaN, Infinity, 'x'])('monto %p se rechaza', v => {
        expect(() => exigirMonto(v)).toThrow(/mayor o igual a 0/);
    });

    test('monto 0 es válido', () => {
        expect(exigirMonto(0)).toBe(0);
    });

    test('validarLineas revisa cantidad, precio y subtotal', () => {
        expect(() => validarLineas([{ cantidad: 1, precio: 10, subtotal: 10 }])).not.toThrow();
        expect(() => validarLineas([{ cantidad: -2, precio: 10 }])).toThrow();
        expect(() => validarLineas([{ cantidad: 1, precio: -10 }])).toThrow();
        expect(() => validarLineas([{ cantidad: 1, precio: 10, subtotal: -5 }])).toThrow();
    });
});

describe('las ventas rechazan cantidades/precios hostiles sin tocar la BD', () => {
    beforeEach(() => jest.clearAllMocks());

    test('AgregarServicioService: cantidad negativa', async () => {
        await expect(
            AgregarServicioService.execute({ tenantId: 1, pedidoId: 1, servicio_id: 1, cantidad: -3, precio: 5000 })
        ).rejects.toThrow(/mayor que 0/);
        expect(db.query).not.toHaveBeenCalled();
    });

    test('AgregarServicioService: precio negativo', async () => {
        await expect(
            AgregarServicioService.execute({ tenantId: 1, pedidoId: 1, servicio_id: 1, cantidad: 1, precio: -5000 })
        ).rejects.toThrow(/mayor o igual a 0/);
    });

    test('AgregarItemService: cantidad negativa', async () => {
        await expect(
            AgregarItemService.execute({ tenantId: 1, pedidoId: 1, producto_id: 3, cantidad: -1, precio: 1000 })
        ).rejects.toThrow(/mayor que 0/);
        expect(db.query).not.toHaveBeenCalled();
    });

    test('FacturaService.create: cantidad negativa o total negativo', async () => {
        const base = { cliente_id: 1, forma_pago: 'efectivo', total: 1000 };
        await expect(
            FacturaService.create(1, {
                ...base,
                productos: [{ producto_id: 1, cantidad: -2, precio: 1000, subtotal: -2000 }]
            })
        ).rejects.toThrow(/mayor que 0/);
        await expect(
            FacturaService.create(1, {
                ...base,
                total: -500,
                productos: [{ producto_id: 1, cantidad: 1, precio: 1000, subtotal: 1000 }]
            })
        ).rejects.toThrow(/total/i);
    });
});
