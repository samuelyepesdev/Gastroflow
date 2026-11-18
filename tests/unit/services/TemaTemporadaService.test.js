jest.mock('../../../config/database', () => ({ query: jest.fn() }));
jest.mock('../../../repositories/Tenant/TemaTemporadaRepository');

const TemaTemporadaRepository = require('../../../repositories/Tenant/TemaTemporadaRepository');
const TemaTemporadaService = require('../../../services/Tenant/TemaTemporadaService');

const { resolver } = TemaTemporadaService;

const global = (extra = {}) => ({
    tema: 'navidad',
    activo: 1,
    desde: '2026-12-01',
    hasta: '2027-01-06',
    mensaje: 'Felices fiestas',
    animaciones: 1,
    ...extra
});
const fila = (extra = {}) => ({
    tema: 'navidad',
    activo: 1,
    desde: null,
    hasta: null,
    mensaje: null,
    animaciones: 1,
    ...extra
});

describe('TemaTemporadaService - prioridad restaurante > global (resolver)', () => {
    it('sin fila y global apagado: sin tema', () => {
        expect(resolver(null, global({ activo: 0 })).activo).toBe(false);
        expect(resolver(null, null).activo).toBe(false);
    });

    it('sin fila y global activo: hereda lo global, con su ventana y su mensaje', () => {
        expect(resolver(null, global())).toMatchObject({
            activo: true,
            origen: 'global',
            desde: '2026-12-01',
            hasta: '2027-01-06',
            mensaje: 'Felices fiestas'
        });
    });

    it('fila con activo NULL (sin decidir): también hereda el global', () => {
        expect(resolver(fila({ activo: null }), global())).toMatchObject({ activo: true, origen: 'global' });
    });

    it('el restaurante que lo apagó a propósito (0) gana sobre el global activo', () => {
        expect(resolver(fila({ activo: 0 }), global())).toMatchObject({ activo: false, origen: 'restaurante' });
    });

    it('el restaurante que lo activó (1) gana sobre el global apagado', () => {
        expect(resolver(fila({ activo: 1 }), global({ activo: 0 }))).toMatchObject({
            activo: true,
            origen: 'restaurante'
        });
    });

    it('fechas y mensaje propios del restaurante pisan a los globales; si faltan, usa los globales', () => {
        const propio = resolver(fila({ desde: '2026-12-10', hasta: '2026-12-31', mensaje: 'Menú especial' }), global());
        expect(propio).toMatchObject({ desde: '2026-12-10', hasta: '2026-12-31', mensaje: 'Menú especial' });
        const heredado = resolver(fila({ activo: 1 }), global());
        expect(heredado).toMatchObject({ desde: '2026-12-01', hasta: '2027-01-06', mensaje: 'Felices fiestas' });
    });

    it('las animaciones quedan apagadas si cualquiera de los dos las apaga', () => {
        expect(resolver(null, global({ animaciones: 0 })).animaciones).toBe(false);
        expect(resolver(fila({ animaciones: 0 }), global()).animaciones).toBe(false);
        expect(resolver(fila(), global()).animaciones).toBe(true);
    });
});

describe('TemaTemporadaService.getActivo', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        TemaTemporadaRepository.getGlobal.mockResolvedValue(null);
    });

    it('sin configuración o desactivado: sin tema', async () => {
        TemaTemporadaRepository.get.mockResolvedValue(null);
        await expect(TemaTemporadaService.getActivo(1, '2026-12-10')).resolves.toBeNull();
        TemaTemporadaRepository.get.mockResolvedValue(fila({ activo: 0 }));
        await expect(TemaTemporadaService.getActivo(1, '2026-12-10')).resolves.toBeNull();
    });

    it('activo y dentro de la ventana (extremos inclusive): devuelve el tema', async () => {
        TemaTemporadaRepository.get.mockResolvedValue(
            fila({ desde: '2026-12-01', hasta: '2027-01-06', mensaje: 'Felices fiestas' })
        );
        await expect(TemaTemporadaService.getActivo(1, '2026-12-01')).resolves.toEqual({
            tema: 'navidad',
            mensaje: 'Felices fiestas',
            animaciones: true
        });
        await expect(TemaTemporadaService.getActivo(1, '2027-01-06')).resolves.toMatchObject({ tema: 'navidad' });
    });

    it('fuera de la ventana: sin tema', async () => {
        TemaTemporadaRepository.get.mockResolvedValue(fila({ desde: '2026-12-01', hasta: '2027-01-06' }));
        await expect(TemaTemporadaService.getActivo(1, '2026-11-30')).resolves.toBeNull();
        await expect(TemaTemporadaService.getActivo(1, '2027-01-07')).resolves.toBeNull();
    });

    it('un restaurante sin fila ve el tema cuando el superadmin lo activa para todos, dentro de la ventana global', async () => {
        TemaTemporadaRepository.get.mockResolvedValue(null);
        TemaTemporadaRepository.getGlobal.mockResolvedValue(global());
        await expect(TemaTemporadaService.getActivo(1, '2026-12-24')).resolves.toMatchObject({
            mensaje: 'Felices fiestas'
        });
        await expect(TemaTemporadaService.getActivo(1, '2027-02-01')).resolves.toBeNull();
    });

    it('un restaurante que lo apagó no lo ve aunque el global esté activo', async () => {
        TemaTemporadaRepository.get.mockResolvedValue(fila({ activo: 0 }));
        TemaTemporadaRepository.getGlobal.mockResolvedValue(global());
        await expect(TemaTemporadaService.getActivo(1, '2026-12-24')).resolves.toBeNull();
    });

    it('si la base de datos falla, la página se ve sin tema (no lanza)', async () => {
        const log = jest.spyOn(console, 'error').mockImplementation(() => {});
        TemaTemporadaRepository.get.mockRejectedValue(new Error('db caída'));
        await expect(TemaTemporadaService.getActivo(1, '2026-12-10')).resolves.toBeNull();
        log.mockRestore();
    });
});

describe('TemaTemporadaService.guardar y guardarGlobal', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        TemaTemporadaRepository.get.mockResolvedValue(null);
        TemaTemporadaRepository.getGlobal.mockResolvedValue(null);
    });

    it('el restaurante guarda una decisión explícita con mensaje recortado', async () => {
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

    it('apagar desde el restaurante guarda 0 (no NULL): es una decisión que prevalece sobre lo global', async () => {
        await TemaTemporadaService.guardar(1, { activo: false });
        expect(TemaTemporadaRepository.upsert.mock.calls[0][1].activo).toBe(0);
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

    it('el superadmin guarda la configuración global con las mismas reglas', async () => {
        await TemaTemporadaService.guardarGlobal({
            activo: true,
            desde: '2026-12-01',
            hasta: '2027-01-06',
            mensaje: 'Hola'
        });
        expect(TemaTemporadaRepository.upsertGlobal).toHaveBeenCalledWith(
            expect.objectContaining({ activo: 1, desde: '2026-12-01', hasta: '2027-01-06', mensaje: 'Hola' })
        );
    });

    it.each([
        [{ desde: '2027-01-06', hasta: '2026-12-01' }, 'TEMA_FECHAS_INVALIDAS'],
        [{ mensaje: 'x'.repeat(161) }, 'TEMA_MENSAJE_LARGO']
    ])('rechaza %j', async (body, codigo) => {
        await expect(TemaTemporadaService.guardar(1, body)).rejects.toMatchObject({ code: codigo });
        await expect(TemaTemporadaService.guardarGlobal(body)).rejects.toMatchObject({ code: codigo });
        expect(TemaTemporadaRepository.upsert).not.toHaveBeenCalled();
        expect(TemaTemporadaRepository.upsertGlobal).not.toHaveBeenCalled();
    });
});

describe('TemaTemporadaService.getConfig (panel del restaurante)', () => {
    beforeEach(() => jest.clearAllMocks());

    it('indica que hereda cuando no ha decidido y el superadmin lo activó para todos', async () => {
        TemaTemporadaRepository.get.mockResolvedValue(null);
        TemaTemporadaRepository.getGlobal.mockResolvedValue(global());
        const c = await TemaTemporadaService.getConfig(1);
        expect(c).toMatchObject({
            activo: true,
            hereda: true,
            global: { desde: '2026-12-01', hasta: '2027-01-06', mensaje: 'Felices fiestas' }
        });
    });

    it('si el restaurante lo apagó, no hereda aunque el global esté activo', async () => {
        TemaTemporadaRepository.get.mockResolvedValue(fila({ activo: 0 }));
        TemaTemporadaRepository.getGlobal.mockResolvedValue(global());
        await expect(TemaTemporadaService.getConfig(1)).resolves.toMatchObject({ activo: false, hereda: false });
    });
});

describe('TemaTemporadaService - panel del superadmin', () => {
    beforeEach(() => jest.clearAllMocks());

    it('lista los restaurantes con su estado y si el tema se ve hoy', async () => {
        TemaTemporadaRepository.getGlobal.mockResolvedValue(global());
        TemaTemporadaRepository.listarRestaurantes.mockResolvedValue([
            { id: 1, nombre: 'A', slug: 'a', tiene_fila: 0 },
            { id: 2, nombre: 'B', slug: 'b', tiene_fila: 1, activo: 0 },
            { id: 3, nombre: 'C', slug: 'c', tiene_fila: 1, activo: 1, animaciones: 1 },
            { id: 4, nombre: 'D', slug: 'd', tiene_fila: 1, activo: null, animaciones: 1 }
        ]);
        const r = await TemaTemporadaService.listarRestaurantes('2026-12-24');
        expect(r.map(x => [x.id, x.estado, x.visible])).toEqual([
            [1, 'heredar', true],
            [2, 'apagado', false],
            [3, 'activado', true],
            [4, 'heredar', true]
        ]);
    });

    it.each([
        ['heredar', null],
        ['activado', 1],
        ['apagado', 0]
    ])('forzar «%s» guarda %s sin tocar fechas ni mensaje', async (estado, valor) => {
        TemaTemporadaRepository.tenantExiste.mockResolvedValue(true);
        await TemaTemporadaService.setEstadoRestaurante(7, estado);
        expect(TemaTemporadaRepository.setDecision).toHaveBeenCalledWith(7, valor);
    });

    it('rechaza un estado inválido y un restaurante inexistente', async () => {
        await expect(TemaTemporadaService.setEstadoRestaurante(7, 'quizas')).rejects.toMatchObject({
            code: 'TEMA_ESTADO_INVALIDO'
        });
        TemaTemporadaRepository.tenantExiste.mockResolvedValue(false);
        await expect(TemaTemporadaService.setEstadoRestaurante(99, 'activado')).rejects.toMatchObject({
            statusCode: 404
        });
        expect(TemaTemporadaRepository.setDecision).not.toHaveBeenCalled();
    });
});
