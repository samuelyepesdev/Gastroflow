/**
 * POSService: abonos a la cuenta de una orden guardada del POS.
 */
jest.mock('../../../repositories/Tenant/POSRepository', () => ({
    esPedidoPOS: jest.fn(),
    getPedidoDeBorrador: jest.fn(),
    deleteBorrador: jest.fn()
}));
jest.mock('../../../repositories/Tenant/PedidoAbonoRepository', () => ({
    sumByPedido: jest.fn(),
    findById: jest.fn()
}));
jest.mock('../../../services/Tenant/Mesas/AbonoPedidoService', () => ({
    registrar: jest.fn(),
    listar: jest.fn(),
    eliminar: jest.fn()
}));
jest.mock('../../../services/Tenant/PromocionService', () => ({}));
jest.mock('../../../services/Shared/RealtimeEvents', () => ({ emitPedido: jest.fn() }));
jest.mock('../../../services/Tenant/TenantOwnership', () => ({ clientes: jest.fn(), productos: jest.fn() }));
jest.mock('../../../services/Tenant/ComboArmableService', () => ({}));

const POSRepository = require('../../../repositories/Tenant/POSRepository');
const PedidoAbonoRepository = require('../../../repositories/Tenant/PedidoAbonoRepository');
const AbonoPedidoService = require('../../../services/Tenant/Mesas/AbonoPedidoService');
const POSService = require('../../../services/Tenant/POSService');

beforeEach(() => jest.clearAllMocks());

describe('POSService abonos', () => {
    it('registra el abono sobre el pedido de la orden y pasa el total real del carrito como tope', async () => {
        POSRepository.esPedidoPOS.mockResolvedValue(true);
        AbonoPedidoService.registrar.mockResolvedValue({ abono_id: 3, saldo_pendiente: 20000 });

        const res = await POSService.registrarAbono({
            tenantId: 1,
            usuarioId: 9,
            pedidoId: 40,
            monto: 10000,
            forma_pago: 'efectivo',
            totalVenta: 30000
        });

        expect(AbonoPedidoService.registrar).toHaveBeenCalledWith(
            expect.objectContaining({ tenantId: 1, pedidoId: 40, monto: 10000, usuarioId: 9, totalVenta: 30000 })
        );
        expect(res).toEqual({ abono_id: 3, saldo_pendiente: 20000 });
    });

    it('no deja abonar a un pedido que no es una orden guardada del POS (p. ej. una mesa)', async () => {
        POSRepository.esPedidoPOS.mockResolvedValue(false);

        await expect(
            POSService.registrarAbono({ tenantId: 1, pedidoId: 77, monto: 1000, forma_pago: 'efectivo' })
        ).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/no está guardada en el POS/) });
        expect(AbonoPedidoService.registrar).not.toHaveBeenCalled();
        await expect(POSService.listarAbonos(1, 77)).rejects.toThrow('no está guardada en el POS');
    });

    it('solo elimina abonos de órdenes del POS', async () => {
        PedidoAbonoRepository.findById.mockResolvedValue({ id: 5, pedido_id: 77 });
        POSRepository.esPedidoPOS.mockResolvedValue(false);
        await expect(POSService.eliminarAbono(1, 5)).rejects.toThrow('no está guardada en el POS');

        POSRepository.esPedidoPOS.mockResolvedValue(true);
        AbonoPedidoService.eliminar.mockResolvedValue({ message: 'Abono eliminado' });
        await expect(POSService.eliminarAbono(1, 5)).resolves.toEqual({ message: 'Abono eliminado' });
        expect(AbonoPedidoService.eliminar).toHaveBeenCalledWith({ tenantId: 1, abonoId: 5 });

        PedidoAbonoRepository.findById.mockResolvedValue(null);
        await expect(POSService.eliminarAbono(1, 6)).rejects.toThrow('Abono no encontrado');
    });

    it('no elimina una orden guardada que ya tiene abonos', async () => {
        POSRepository.getPedidoDeBorrador.mockResolvedValue(40);
        PedidoAbonoRepository.sumByPedido.mockResolvedValue({ efectivo: 0, transferencia: 5000 });

        await expect(POSService.deleteBorrador(8, 1)).rejects.toMatchObject({
            status: 400,
            message: expect.stringMatching(/tiene abonos/)
        });
        expect(POSRepository.deleteBorrador).not.toHaveBeenCalled();
    });

    it('elimina la orden guardada cuando no tiene abonos', async () => {
        POSRepository.getPedidoDeBorrador.mockResolvedValue(40);
        PedidoAbonoRepository.sumByPedido.mockResolvedValue({ efectivo: 0, transferencia: 0 });
        POSRepository.deleteBorrador.mockResolvedValue(null);

        await expect(POSService.deleteBorrador(8, 1)).resolves.toBe(false);
        expect(POSRepository.deleteBorrador).toHaveBeenCalledWith(8, 1);
    });
});
