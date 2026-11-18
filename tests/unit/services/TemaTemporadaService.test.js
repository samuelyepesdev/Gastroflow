jest.mock('../../../config/database', () => ({ query: jest.fn() }));
jest.mock('../../../repositories/Tenant/TemaTemporadaRepository');

const TemaTemporadaRepository = require('../../../repositories/Tenant/TemaTemporadaRepository');
const TemaTemporadaService = require('../../../services/Tenant/TemaTemporadaService');

describe('TemaTemporadaService.getActivo', () => {
    beforeEach(() => jest.clearAllMocks());

    it('sin configuración o desactivado: sin tema', async () => {
        TemaTemporadaRepository.get.mockResolvedValue(null);
        await expect(TemaTemporadaService.getActivo(1, '2026-12-10')).resolves.toBeNull();
        TemaTemporadaRepository.get.mockResolvedValue({ tema: 'navidad', activo: 0, desde: null, hasta: null });
        await expect(TemaTemporadaService.getActivo(1, '2026-12-10')).resolves.toBeNull();
    });

    it('activo y dentro de la ventana (extremos inclusive): devuelve el tema', async () => {
        TemaTemporadaRepository.get.mockResolvedValue({
            tema: 'navidad',
            activo: 1,
            desde: '2026-12-01',
            hasta: '2027-01-06',
            mensaje: 'Felices fiestas',
            animaciones: 1
        });
        await expect(TemaTemporadaService.getActivo(1, '2026-12-01')).resolves.toEqual({
            tema: 'navidad',
            mensaje: 'Felices fiestas',
            animaciones: true
        });
        await expect(TemaTemporadaService.getActivo(1, '2027-01-06')).resolves.toMatchObject({ tema: 'navidad' });
    });

    it('fuera de la ventana: sin tema', async () => {
        TemaTemporadaRepository.get.mockResolvedValue({
            tema: 'navidad',
            activo: 1,
            desde: '2026-12-01',
            hasta: '2027-01-06'
        });
        await expect(TemaTemporadaService.getActivo(1, '2026-11-30')).resolves.toBeNull();
        await expect(TemaTemporadaService.getActivo(1, '2027-01-07')).resolves.toBeNull();
    });

    it('sin fechas el tema está activo siempre que el interruptor esté encendido', async () => {
        TemaTemporadaRepository.get.mockResolvedValue({
            tema: 'navidad',
            activo: 1,
            desde: null,
            hasta: null,
            animaciones: 0
        });
        await expect(TemaTemporadaService.getActivo(1, '2026-06-01')).resolves.toMatchObject({ animaciones: false });
    });

    it('si la base de datos falla, la página se ve sin tema (no lanza)', async () => {
        const log = jest.spyOn(console, 'error').mockImplementation(() => {});
        TemaTemporadaRepository.get.mockRejectedValue(new Error('db caída'));
        await expect(TemaTemporadaService.getActivo(1, '2026-12-10')).resolves.toBeNull();
        log.mockRestore();
    });
});

describe('TemaTemporadaService.guardar', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        TemaTemporadaRepository.get.mockResolvedValue(null);
    });

    it('guarda activo, fechas y mensaje recortado', async () => {
        await TemaTemporadaService.guardar(1, {
            activo: true,
            desde: '2026-12-01',
            hasta: '2027-01-06',
            mensaje: '  Felices fiestas  ',
            animaciones: false
        });
        expect(TemaTemporadaRepository.upsert).toHaveBeenCalledWith(1, {
            tema: 'navidad',
            activo: 1,
            desde: '2026-12-01',
            hasta: '2027-01-06',
            mensaje: 'Felices fiestas',
            animaciones: 0
        });
    });

    it('un tema desconocido cae en navidad y las fechas vacías quedan en NULL', async () => {
        await TemaTemporadaService.guardar(1, { tema: 'halloween', activo: '1', desde: '', hasta: '' });
        expect(TemaTemporadaRepository.upsert.mock.calls[0][1]).toMatchObject({
            tema: 'navidad',
            desde: null,
            hasta: null,
            animaciones: 1
        });
    });

    it.each([
        [{ desde: '2027-01-06', hasta: '2026-12-01' }, 'TEMA_FECHAS_INVALIDAS'],
        [{ mensaje: 'x'.repeat(161) }, 'TEMA_MENSAJE_LARGO']
    ])('rechaza %j', async (body, codigo) => {
        await expect(TemaTemporadaService.guardar(1, body)).rejects.toMatchObject({ code: codigo });
        expect(TemaTemporadaRepository.upsert).not.toHaveBeenCalled();
    });
});
