jest.mock('../../../repositories/Tenant/EventoRepository');

const EventoRepository = require('../../../repositories/Tenant/EventoRepository');
const EventoService = require('../../../services/Tenant/EventoService');

describe('EventoService.delete', () => {
    beforeEach(() => jest.clearAllMocks());

    it('no elimina un evento con ventas (sus facturas pasarían a contar como ventas normales)', async () => {
        EventoRepository.countVentas.mockResolvedValue(3);
        await expect(EventoService.delete(5, 1)).rejects.toThrow(/3 ventas registradas y no se puede eliminar/);
        expect(EventoRepository.delete).not.toHaveBeenCalled();
    });

    it('usa el singular con una sola venta', async () => {
        EventoRepository.countVentas.mockResolvedValue(1);
        await expect(EventoService.delete(5, 1)).rejects.toThrow(/1 venta registrada y no se puede eliminar/);
    });

    it('elimina un evento sin ventas', async () => {
        EventoRepository.countVentas.mockResolvedValue(0);
        EventoRepository.delete.mockResolvedValue(true);
        await expect(EventoService.delete(5, 1)).resolves.toBeUndefined();
        expect(EventoRepository.delete).toHaveBeenCalledWith(5, 1);
    });

    it('avisa si el evento no existe', async () => {
        EventoRepository.countVentas.mockResolvedValue(0);
        EventoRepository.delete.mockResolvedValue(false);
        await expect(EventoService.delete(9, 1)).rejects.toThrow('Evento no encontrado.');
    });
});
