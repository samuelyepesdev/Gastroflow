const FacturarPedidoService = require('../../../services/Tenant/Mesas/FacturarPedidoService');
const db = require('../../../config/database');
const FacturaRepository = require('../../../repositories/Tenant/FacturaRepository');
const WhatsAppService = require('../../../services/Tenant/WhatsAppService');

jest.mock('../../../config/database', () => {
    const mockConnection = {
        beginTransaction: jest.fn(),
        commit: jest.fn(),
        rollback: jest.fn(),
        release: jest.fn(),
        query: jest.fn()
    };
    return {
        getConnection: jest.fn().mockResolvedValue(mockConnection),
        query: jest.fn()
    };
});

jest.mock('../../../repositories/Tenant/FacturaRepository', () => ({
    acomodarNumeracionSiFalta: jest.fn(),
    createWithDetails: jest.fn().mockResolvedValue({ insertId: 100 }),
    obtenerSiguienteNumero: jest.fn().mockResolvedValue(123)
}));

jest.mock('../../../services/Tenant/InventarioService', () => ({
    descontarStockReceta: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../../../services/Tenant/FinanzasService', () => ({
    registrarIngresoVenta: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../../../services/Shared/CacheService', () => ({
    deleteByPrefix: jest.fn(),
    delete: jest.fn()
}));

jest.mock('../../../services/Tenant/WhatsAppService', () => ({
    events: {
        emit: jest.fn()
    }
}));

describe('FacturarPedidoService', () => {
    let mockConn;

    beforeEach(() => {
        jest.clearAllMocks();
        mockConn = {
            beginTransaction: jest.fn(),
            commit: jest.fn(),
            rollback: jest.fn(),
            release: jest.fn(),
            query: jest.fn()
        };
        db.getConnection.mockResolvedValue(mockConn);
    });

    it('lanza "Pedido no encontrado" si el pedido no existe', async () => {
        mockConn.query.mockResolvedValueOnce([[]]); // SELECT pedidos

        await expect(
            FacturarPedidoService.execute({
                tenantId: 1,
                pedidoId: 10,
                cliente_id: 1,
                forma_pago: 'efectivo',
                descuentosMap: {},
                propinaBody: 0
            })
        ).rejects.toThrow('Pedido no encontrado');

        expect(mockConn.rollback).toHaveBeenCalled();
        expect(mockConn.release).toHaveBeenCalled();
    });

    it('lanza error si el pedido ya está cerrado', async () => {
        mockConn.query.mockResolvedValueOnce([[{ id: 10, estado: 'cerrado', mesa_id: 2 }]]); // SELECT pedidos

        await expect(
            FacturarPedidoService.execute({
                tenantId: 1,
                pedidoId: 10,
                cliente_id: 1,
                forma_pago: 'efectivo',
                descuentosMap: {},
                propinaBody: 0
            })
        ).rejects.toThrow('El pedido ya ha sido cerrado y facturado');

        expect(mockConn.rollback).toHaveBeenCalled();
        expect(mockConn.release).toHaveBeenCalled();
    });

    it('lanza error si el pedido ya está cancelado', async () => {
        mockConn.query.mockResolvedValueOnce([[{ id: 10, estado: 'cancelado', mesa_id: 2 }]]); // SELECT pedidos

        await expect(
            FacturarPedidoService.execute({
                tenantId: 1,
                pedidoId: 10,
                cliente_id: 1,
                forma_pago: 'efectivo',
                descuentosMap: {},
                propinaBody: 0
            })
        ).rejects.toThrow('El pedido ha sido cancelado');

        expect(mockConn.rollback).toHaveBeenCalled();
        expect(mockConn.release).toHaveBeenCalled();
    });

    it('lanza "Pedido sin items" si no tiene items', async () => {
        mockConn.query
            .mockResolvedValueOnce([[{ id: 10, estado: 'abierto', mesa_id: 2 }]]) // SELECT pedidos
            .mockResolvedValueOnce([[]]); // SELECT items

        await expect(
            FacturarPedidoService.execute({
                tenantId: 1,
                pedidoId: 10,
                cliente_id: 1,
                forma_pago: 'efectivo',
                descuentosMap: {},
                propinaBody: 0
            })
        ).rejects.toThrow('Pedido sin items');
    });

    it('factura correctamente y emite el evento SSE "billed"', async () => {
        mockConn.query
            .mockResolvedValueOnce([[{ id: 10, estado: 'abierto', mesa_id: 2, total: 5000 }]]) // SELECT pedidos
            .mockResolvedValueOnce([[{ id: 1, cantidad: 1, precio_unitario: 5000, pagado: 0 }]]); // SELECT items

        // Simular queries internas de facturación
        mockConn.query.mockResolvedValue([{ insertId: 100 }]); // INSERT factura, etc.

        const res = await FacturarPedidoService.execute({
            tenantId: 1,
            pedidoId: 10,
            cliente_id: 1,
            forma_pago: 'efectivo',
            descuentosMap: {},
            propinaBody: 0
        });

        expect(res).toHaveProperty('factura_id');
        expect(mockConn.commit).toHaveBeenCalled();
        expect(mockConn.release).toHaveBeenCalled();

        // Verificar que se emitió el evento SSE
        expect(WhatsAppService.events.emit).toHaveBeenCalledWith(
            'orderCreated',
            expect.objectContaining({
                tenantId: 1,
                pedidoId: 10,
                mesaId: 2,
                action: 'billed'
            })
        );
    });
});
