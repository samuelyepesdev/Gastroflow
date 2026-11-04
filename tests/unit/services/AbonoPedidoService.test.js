const AbonoPedidoService = require('../../../services/Tenant/Mesas/AbonoPedidoService');
const db = require('../../../config/database');
const PedidoAbonoRepository = require('../../../repositories/Tenant/PedidoAbonoRepository');

jest.mock('../../../config/database', () => ({ query: jest.fn() }));
jest.mock('../../../repositories/Tenant/PedidoAbonoRepository', () => ({
    sumByPedido: jest.fn(),
    create: jest.fn(),
    findByPedido: jest.fn(),
    findById: jest.fn(),
    delete: jest.fn()
}));

describe('AbonoPedidoService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getSaldoPendiente', () => {
        it('resta ítems no pagados - abonos ya registrados (la propina no se abona por adelantado)', async () => {
            db.query
                .mockResolvedValueOnce([[{ id: 10, propina: 2000, estado: 'abierto' }]]) // SELECT pedidos
                .mockResolvedValueOnce([[{ total: 30000 }]]); // SELECT SUM(subtotal) items no pagados
            PedidoAbonoRepository.sumByPedido.mockResolvedValueOnce({ efectivo: 15000, transferencia: 0 });

            const { saldoPendiente, totalAbonado } = await AbonoPedidoService.getSaldoPendiente(1, 10);

            expect(saldoPendiente).toBe(15000); // 30000 - 15000 (propina excluida)
            expect(totalAbonado).toBe(15000);
        });

        it('lanza error si el pedido no existe', async () => {
            db.query.mockResolvedValueOnce([[]]);
            await expect(AbonoPedidoService.getSaldoPendiente(1, 999)).rejects.toThrow('Pedido no encontrado');
        });
    });

    describe('registrar', () => {
        const mockSaldo = (saldoPendiente, estado = 'abierto') => {
            db.query
                .mockResolvedValueOnce([[{ id: 10, propina: 0, estado }]])
                .mockResolvedValueOnce([[{ total: saldoPendiente }]]);
            PedidoAbonoRepository.sumByPedido.mockResolvedValueOnce({ efectivo: 0, transferencia: 0 });
        };

        it('rechaza forma_pago inválida', async () => {
            await expect(
                AbonoPedidoService.registrar({ tenantId: 1, pedidoId: 10, monto: 1000, forma_pago: 'tarjeta' })
            ).rejects.toThrow('efectivo o transferencia');
        });

        it('rechaza monto <= 0', async () => {
            await expect(
                AbonoPedidoService.registrar({ tenantId: 1, pedidoId: 10, monto: 0, forma_pago: 'efectivo' })
            ).rejects.toThrow('mayor a cero');
        });

        it('rechaza un abono mayor al saldo pendiente (no queda atado a productos, pero no puede superar el total)', async () => {
            mockSaldo(10000);
            await expect(
                AbonoPedidoService.registrar({ tenantId: 1, pedidoId: 10, monto: 15000, forma_pago: 'efectivo' })
            ).rejects.toThrow('no puede superar el saldo pendiente');
        });

        it('con totalVenta (POS con descuentos) el abono tampoco puede pasar de lo que falta de ese total', async () => {
            mockSaldo(30000); // los ítems suman 30000, pero el carrito con descuento vale 20000
            await expect(
                AbonoPedidoService.registrar({
                    tenantId: 1,
                    pedidoId: 10,
                    monto: 25000,
                    forma_pago: 'efectivo',
                    totalVenta: 20000
                })
            ).rejects.toThrow('no puede superar el saldo pendiente (20000)');
        });

        it('rechaza abonar a un pedido ya cerrado', async () => {
            mockSaldo(10000, 'cerrado');
            await expect(
                AbonoPedidoService.registrar({ tenantId: 1, pedidoId: 10, monto: 5000, forma_pago: 'efectivo' })
            ).rejects.toThrow('ya cerrado o cancelado');
        });

        it('registra el abono cuando el monto cabe dentro del saldo pendiente', async () => {
            mockSaldo(30000);
            PedidoAbonoRepository.create.mockResolvedValueOnce(55);
            // segunda lectura de saldo (después de insertar) para el saldo restante
            db.query
                .mockResolvedValueOnce([[{ id: 10, propina: 0, estado: 'abierto' }]])
                .mockResolvedValueOnce([[{ total: 30000 }]]);
            PedidoAbonoRepository.sumByPedido.mockResolvedValueOnce({ efectivo: 15000, transferencia: 0 });

            const res = await AbonoPedidoService.registrar({
                tenantId: 1,
                pedidoId: 10,
                monto: 15000,
                forma_pago: 'efectivo'
            });

            expect(PedidoAbonoRepository.create).toHaveBeenCalledWith(
                expect.objectContaining({ tenantId: 1, pedidoId: 10, monto: 15000, forma_pago: 'efectivo' })
            );
            expect(res).toEqual({ abono_id: 55, saldo_pendiente: 15000 });
        });
    });

    describe('eliminar', () => {
        it('rechaza eliminar un abono de un pedido ya cerrado', async () => {
            PedidoAbonoRepository.findById.mockResolvedValueOnce({ id: 5, pedido_id: 10 });
            db.query.mockResolvedValueOnce([[{ estado: 'cerrado' }]]);

            await expect(AbonoPedidoService.eliminar({ tenantId: 1, abonoId: 5 })).rejects.toThrow(
                'ya cerrado o cancelado'
            );
            expect(PedidoAbonoRepository.delete).not.toHaveBeenCalled();
        });

        it('elimina el abono si el pedido sigue abierto', async () => {
            PedidoAbonoRepository.findById.mockResolvedValueOnce({ id: 5, pedido_id: 10 });
            db.query.mockResolvedValueOnce([[{ estado: 'abierto' }]]);

            const res = await AbonoPedidoService.eliminar({ tenantId: 1, abonoId: 5 });

            expect(PedidoAbonoRepository.delete).toHaveBeenCalledWith(5, 1);
            expect(res).toEqual({ message: 'Abono eliminado' });
        });
    });
});
