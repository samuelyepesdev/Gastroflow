jest.mock('../../../config/database', () => ({ query: jest.fn() }));
jest.mock('../../../repositories/Tenant/ResenaRepository');

const ResenaRepository = require('../../../repositories/Tenant/ResenaRepository');
const ResenaService = require('../../../services/Tenant/ResenaService');

const { validarGoogleUrl, armarResumen } = ResenaService;

const CONFIG = { tenant_id: 7, activo: 1, token_publico: 'abc', restaurante: 'La Cazuela', google_url: null };

describe('ResenaService.validarGoogleUrl', () => {
    it.each([
        ['https://g.page/r/CabcDEF/review'],
        ['https://search.google.com/local/writereview?placeid=XYZ'],
        ['https://www.google.com/maps/place/algo'],
        ['https://maps.app.goo.gl/AbCd123']
    ])('acepta %s', url => {
        expect(validarGoogleUrl(url)).toContain('https://');
    });

    it('devuelve null si viene vacío', () => {
        expect(validarGoogleUrl('   ')).toBeNull();
        expect(validarGoogleUrl(undefined)).toBeNull();
    });

    it.each([
        ['http://g.page/r/abc/review'],
        ['javascript:alert(1)'],
        ['https://evil.com/google.com'],
        ['https://google.com.evil.com/review'],
        ['no es una url']
    ])('rechaza %s', url => {
        expect(() => validarGoogleUrl(url)).toThrow(expect.objectContaining({ code: 'RESENA_GOOGLE_URL_INVALIDA' }));
    });
});

describe('ResenaService.armarResumen', () => {
    it('calcula promedio, total y distribución', () => {
        const r = armarResumen([
            { calificacion: 5, total: 3 },
            { calificacion: 4, total: 1 },
            { calificacion: 1, total: 1 }
        ]);
        expect(r.total).toBe(5);
        expect(r.promedio).toBe(4); // (15 + 4 + 1) / 5
        expect(r.distribucion).toEqual({ 1: 1, 2: 0, 3: 0, 4: 1, 5: 3 });
    });

    it('sin reseñas el promedio es null', () => {
        expect(armarResumen([])).toMatchObject({ total: 0, promedio: null });
    });
});

describe('ResenaService.crearPublica', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        ResenaRepository.getConfigPorToken.mockResolvedValue(CONFIG);
        ResenaRepository.crear.mockResolvedValue(1);
    });

    it('guarda en el restaurante del token (nunca del cuerpo) y marca las bajas', async () => {
        const r = await ResenaService.crearPublica(
            'abc',
            { calificacion: '2', comentario: ' tardó ', tenant_id: 99 },
            '203.0.113.5'
        );
        expect(r).toEqual({ calificacion: 2, baja: true });
        expect(ResenaRepository.crear).toHaveBeenCalledWith(
            7,
            expect.objectContaining({ calificacion: 2, comentario: 'tardó', telefono: null, consentimiento_at: null })
        );
    });

    it('una calificación alta no es baja', async () => {
        await expect(ResenaService.crearPublica('abc', { calificacion: 5 })).resolves.toMatchObject({ baja: false });
    });

    it('con celular guarda la evidencia del consentimiento', async () => {
        const ahora = new Date('2026-12-01T15:00:00Z');
        await ResenaService.crearPublica(
            'abc',
            { calificacion: 3, nombre: 'Ana', telefono: '300 123 4567', consentimiento: true },
            '203.0.113.5',
            ahora
        );
        expect(ResenaRepository.crear).toHaveBeenCalledWith(
            7,
            expect.objectContaining({
                nombre: 'Ana',
                telefono: '3001234567',
                consentimiento_at: ahora,
                consentimiento_ip: '203.0.113.5'
            })
        );
    });

    it.each([
        [{ calificacion: 0 }, 'RESENA_CALIFICACION_INVALIDA'],
        [{ calificacion: 6 }, 'RESENA_CALIFICACION_INVALIDA'],
        [{ calificacion: '4.5' }, 'RESENA_CALIFICACION_INVALIDA'],
        [{}, 'RESENA_CALIFICACION_INVALIDA'],
        [{ calificacion: 3, telefono: '12345', consentimiento: true }, 'RESENA_TELEFONO_INVALIDO'],
        [{ calificacion: 3, telefono: '3001234567' }, 'RESENA_SIN_CONSENTIMIENTO'],
        [{ calificacion: 3, comentario: 'x'.repeat(501) }, 'RESENA_TEXTO_LARGO']
    ])('no guarda nada con %j', async (body, codigo) => {
        await expect(ResenaService.crearPublica('abc', body)).rejects.toMatchObject({ code: codigo });
        expect(ResenaRepository.crear).not.toHaveBeenCalled();
    });

    it('rechaza un token que no existe o está apagado', async () => {
        ResenaRepository.getConfigPorToken.mockResolvedValue(null);
        await expect(ResenaService.crearPublica('malo', { calificacion: 5 })).rejects.toMatchObject({
            code: 'RESENA_NO_DISPONIBLE'
        });
        expect(ResenaRepository.crear).not.toHaveBeenCalled();
    });
});

describe('ResenaService.vistaPublica', () => {
    it('solo expone lo que puede ver un cliente anónimo', async () => {
        ResenaRepository.getConfigPorToken.mockResolvedValue({ ...CONFIG, google_url: 'https://g.page/r/x/review' });
        await expect(ResenaService.vistaPublica('abc')).resolves.toEqual({
            restaurante: 'La Cazuela',
            google_url: 'https://g.page/r/x/review',
            mensaje_gracias: null
        });
    });

    it('devuelve null si el enlace no existe', async () => {
        ResenaRepository.getConfigPorToken.mockResolvedValue(null);
        await expect(ResenaService.vistaPublica('malo')).resolves.toBeNull();
    });
});

describe('ResenaService.guardarConfig / marcarAtendida', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        ResenaRepository.getConfig.mockResolvedValue(CONFIG);
    });

    it('valida el enlace de Google antes de guardar', async () => {
        await expect(
            ResenaService.guardarConfig(7, { activo: true, google_url: 'https://evil.com' })
        ).rejects.toMatchObject({
            code: 'RESENA_GOOGLE_URL_INVALIDA'
        });
        expect(ResenaRepository.actualizarConfig).not.toHaveBeenCalled();
    });

    it('guarda la configuración normalizada', async () => {
        await ResenaService.guardarConfig(7, { activo: '1', google_url: '', mensaje_gracias: '  Gracias  ' });
        expect(ResenaRepository.actualizarConfig).toHaveBeenCalledWith(7, {
            activo: true,
            google_url: null,
            mensaje_gracias: 'Gracias'
        });
    });

    it('marcar atendida de otro restaurante o inexistente da 404', async () => {
        ResenaRepository.setEstado.mockResolvedValue(false);
        await expect(ResenaService.marcarAtendida(7, 123, true)).rejects.toMatchObject({
            code: 'RESENA_NO_ENCONTRADA'
        });
        expect(ResenaRepository.setEstado).toHaveBeenCalledWith(7, 123, 'atendida');
    });
});
