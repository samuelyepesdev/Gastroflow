jest.mock('../../../repositories/Tenant/FinanzasRepository', () => ({
    createMovimiento: jest.fn().mockResolvedValue(1),
    getUsuarioPorDefecto: jest.fn()
}));
jest.mock('../../../repositories/Tenant/CajaRepository', () => ({ getSesionAbierta: jest.fn() }));
jest.mock('../../../repositories/Tenant/ProveedorFacturaRepository', () => ({}));
jest.mock('../../../services/Shared/PdfMaker', () => ({}));

const FinanzasRepository = require('../../../repositories/Tenant/FinanzasRepository');
const CajaRepository = require('../../../repositories/Tenant/CajaRepository');
const FinanzasService = require('../../../services/Tenant/FinanzasService');

describe('FinanzasService: nunca atribuye movimientos al usuario 1', () => {
    beforeEach(() => jest.clearAllMocks());

    test('gasto de inventario sin turno ni usuario usa el admin del MISMO restaurante', async () => {
        CajaRepository.getSesionAbierta.mockResolvedValue(null);
        FinanzasRepository.getUsuarioPorDefecto.mockResolvedValue(77);
        await FinanzasService.registrarGastoInventario(5, { monto: 100, insumo_nombre: 'x', mov_id: 1 });
        expect(FinanzasRepository.getUsuarioPorDefecto).toHaveBeenCalledWith(5, null);
        expect(FinanzasRepository.createMovimiento.mock.calls[0][1].usuario_id).toBe(77);
    });

    test('dentro de la transacción de una venta o compra, TODAS las lecturas van por su conexión (no por el pool)', async () => {
        const conn = { query: jest.fn() };
        CajaRepository.getSesionAbierta.mockResolvedValue(null);
        FinanzasRepository.getUsuarioPorDefecto.mockResolvedValue(77);

        await FinanzasService.registrarIngresoVenta(5, { monto: 100, factura_id: 9, conn });
        expect(CajaRepository.getSesionAbierta).toHaveBeenLastCalledWith(5, conn);
        expect(FinanzasRepository.getUsuarioPorDefecto).toHaveBeenLastCalledWith(5, conn);

        await FinanzasService.registrarGastoInventario(5, { monto: 100, insumo_nombre: 'x', mov_id: 1, conn });
        expect(CajaRepository.getSesionAbierta).toHaveBeenLastCalledWith(5, conn);
        expect(FinanzasRepository.getUsuarioPorDefecto).toHaveBeenLastCalledWith(5, conn);
    });

    test('prioridad: usuario explícito > usuario del turno; y pasa la conexión de la transacción', async () => {
        CajaRepository.getSesionAbierta.mockResolvedValue({ id: 3, usuario_id: 40 });
        const conn = { query: jest.fn() };
        await FinanzasService.registrarGastoInventario(5, { monto: 1, insumo_nombre: 'x', mov_id: 1, conn });
        expect(FinanzasRepository.createMovimiento.mock.calls[0][1]).toMatchObject({ usuario_id: 40, conn });
        await FinanzasService.registrarGastoInventario(5, { monto: 1, insumo_nombre: 'x', mov_id: 1, usuario_id: 8 });
        expect(FinanzasRepository.createMovimiento.mock.calls[1][1].usuario_id).toBe(8);
        expect(FinanzasRepository.getUsuarioPorDefecto).not.toHaveBeenCalled();
    });

    test('sin ningún usuario posible falla claro en vez de usar un id ajeno', async () => {
        CajaRepository.getSesionAbierta.mockResolvedValue(null);
        FinanzasRepository.getUsuarioPorDefecto.mockResolvedValue(null);
        await expect(
            FinanzasService.registrarGastoInventario(5, { monto: 1, insumo_nombre: 'x', mov_id: 1 })
        ).rejects.toThrow(/No hay un usuario/);
        expect(FinanzasRepository.createMovimiento).not.toHaveBeenCalled();
    });
});
