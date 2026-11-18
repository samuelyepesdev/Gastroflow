jest.mock('../../../config/database', () => ({ query: jest.fn() }));
jest.mock('../../../repositories/Tenant/TemporadaRepository');
jest.mock('../../../services/Tenant/PromocionService', () => ({ crear: jest.fn() }));

const TemporadaRepository = require('../../../repositories/Tenant/TemporadaRepository');
const PromocionService = require('../../../services/Tenant/PromocionService');
const TemporadaService = require('../../../services/Tenant/TemporadaService');

const { fechasDePlantilla, diasParaNavidad, PLANTILLAS } = TemporadaService;

describe('TemporadaService - plantillas', () => {
    it('resuelve el año actual si la ventana aún no terminó', () => {
        const novena = PLANTILLAS.find(p => p.id === 'novena');
        expect(fechasDePlantilla(novena, '2026-11-18')).toEqual({
            fecha_inicio: '2026-12-16',
            fecha_fin: '2026-12-23'
        });
    });

    it('pasa al año siguiente cuando la ventana ya terminó', () => {
        const velitas = PLANTILLAS.find(p => p.id === 'velitas');
        expect(fechasDePlantilla(velitas, '2026-12-20')).toEqual({
            fecha_inicio: '2027-12-07',
            fecha_fin: '2027-12-08'
        });
    });

    it('cuenta los días para el 24 de diciembre', () => {
        expect(diasParaNavidad('2026-11-18')).toBe(36);
        expect(diasParaNavidad('2026-12-24')).toBe(0);
        expect(diasParaNavidad('2026-12-26')).toBeNull();
    });
});

describe('TemporadaService.crearPromocionDePlantilla', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        PromocionService.crear.mockResolvedValue({ id: 9 });
    });

    it('crea la promoción DESACTIVADA, en porcentaje y con las fechas de la plantilla', async () => {
        const r = await TemporadaService.crearPromocionDePlantilla(1, 7, { plantilla: 'novena' }, '2026-11-18');
        expect(r).toMatchObject({ id: 9, fecha_inicio: '2026-12-16', fecha_fin: '2026-12-23', porcentaje: 10 });
        expect(PromocionService.crear).toHaveBeenCalledWith(
            1,
            expect.objectContaining({
                nombre: 'Novena de Aguinaldos',
                valor_tipo: 'porcentaje',
                valor: 10,
                activa: 0,
                fecha_inicio: '2026-12-16',
                fecha_fin: '2026-12-23'
            }),
            7
        );
    });

    it('permite cambiar el porcentaje y las fechas', async () => {
        await TemporadaService.crearPromocionDePlantilla(
            1,
            7,
            { plantilla: 'navidad', porcentaje: 15, fecha_inicio: '2026-12-20', fecha_fin: '2026-12-25' },
            '2026-11-18'
        );
        expect(PromocionService.crear.mock.calls[0][1]).toMatchObject({
            valor: 15,
            fecha_inicio: '2026-12-20',
            fecha_fin: '2026-12-25'
        });
    });

    it.each([
        [{ plantilla: 'inexistente' }, 'TEMPORADA_PLANTILLA_INVALIDA'],
        [{ plantilla: 'navidad', porcentaje: 0 }, 'TEMPORADA_PORCENTAJE_INVALIDO'],
        [{ plantilla: 'navidad', porcentaje: 101 }, 'TEMPORADA_PORCENTAJE_INVALIDO'],
        [{ plantilla: 'navidad', fecha_inicio: '2026-12-25', fecha_fin: '2026-12-20' }, 'TEMPORADA_FECHAS_INVALIDAS']
    ])('rechaza entradas inválidas %j', async (body, codigo) => {
        await expect(TemporadaService.crearPromocionDePlantilla(1, 7, body, '2026-11-18')).rejects.toMatchObject({
            code: codigo
        });
        expect(PromocionService.crear).not.toHaveBeenCalled();
    });
});

describe('TemporadaService.fijarVigencia', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        TemporadaRepository.findProductosActivos.mockImplementation(async (_t, ids) => ids);
    });

    it('guarda la ventana y la aplica solo al tenant', async () => {
        const r = await TemporadaService.fijarVigencia(
            1,
            { producto_ids: ['3', 3, 4], desde: '2026-12-01', hasta: '2026-12-31' },
            '2026-11-18'
        );
        expect(r).toEqual({ aplicados: 2 });
        expect(TemporadaRepository.upsert).toHaveBeenCalledWith(1, [3, 4], '2026-12-01', '2026-12-31');
        expect(TemporadaRepository.aplicarVigencias).toHaveBeenCalledWith('2026-11-18', 1);
    });

    it('acepta una sola fecha (solo desde, o solo hasta)', async () => {
        await TemporadaService.fijarVigencia(1, { producto_ids: [3], hasta: '2026-12-31' }, '2026-11-18');
        expect(TemporadaRepository.upsert).toHaveBeenCalledWith(1, [3], null, '2026-12-31');
    });

    it.each([
        [{ producto_ids: [], desde: '2026-12-01' }, 'TEMPORADA_SIN_PRODUCTOS'],
        [{ producto_ids: [3] }, 'TEMPORADA_SIN_FECHAS'],
        [{ producto_ids: [3], desde: '2026-12-31', hasta: '2026-12-01' }, 'TEMPORADA_FECHAS_INVALIDAS']
    ])('rechaza %j', async (body, codigo) => {
        await expect(TemporadaService.fijarVigencia(1, body)).rejects.toMatchObject({ code: codigo });
        expect(TemporadaRepository.upsert).not.toHaveBeenCalled();
    });

    it('rechaza productos de otro restaurante o inactivos', async () => {
        TemporadaRepository.findProductosActivos.mockResolvedValue([3]);
        await expect(
            TemporadaService.fijarVigencia(1, { producto_ids: [3, 99], desde: '2026-12-01' })
        ).rejects.toMatchObject({ code: 'TEMPORADA_PRODUCTO_INVALIDO' });
        expect(TemporadaRepository.upsert).not.toHaveBeenCalled();
    });
});

describe('TemporadaService.aplicarVigenciasTodos', () => {
    it('recorre todos los restaurantes (sin tenant)', async () => {
        TemporadaRepository.aplicarVigencias.mockResolvedValue(4);
        await expect(TemporadaService.aplicarVigenciasTodos('2026-12-01')).resolves.toBe(4);
        expect(TemporadaRepository.aplicarVigencias).toHaveBeenCalledWith('2026-12-01');
    });
});
