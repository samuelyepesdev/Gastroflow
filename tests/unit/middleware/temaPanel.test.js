jest.mock('../../../services/Tenant/TemaTemporadaService', () => ({ getActivoPanel: jest.fn() }));

const TemaTemporadaService = require('../../../services/Tenant/TemaTemporadaService');
const temaPanel = require('../../../middleware/temaPanel');

const TEMA = { tema: 'navidad', mensaje: '', animaciones: true };
const correr = async req => {
    const res = { locals: {} };
    const next = jest.fn();
    await temaPanel({ method: 'GET', tenant: { id: 3 }, originalUrl: '/dashboard', ...req }, res, next);
    return { res, next };
};

describe('middleware temaPanel', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        TemaTemporadaService.getActivoPanel.mockResolvedValue(TEMA);
    });

    it('en una página del panel expone el tema y sigue', async () => {
        const { res, next } = await correr({});
        expect(TemaTemporadaService.getActivoPanel).toHaveBeenCalledWith(3);
        expect(res.locals.temaPanel).toEqual(TEMA);
        expect(next).toHaveBeenCalledTimes(1);
    });

    it.each(['/pos', '/pos/ventas?x=1', '/cocina', '/cocina/estaciones', '/api/mesas', '/api/notifications/subscribe'])(
        'se salta %s (pantalla operativa o API)',
        async url => {
            const { res, next } = await correr({ originalUrl: url });
            expect(TemaTemporadaService.getActivoPanel).not.toHaveBeenCalled();
            expect(res.locals.temaPanel).toBeUndefined();
            expect(next).toHaveBeenCalledTimes(1);
        }
    );

    it('no confunde rutas que solo empiezan parecido (/posiciones sí lleva tema)', async () => {
        const { res } = await correr({ originalUrl: '/posiciones' });
        expect(res.locals.temaPanel).toEqual(TEMA);
    });

    it('solo en GET y con restaurante', async () => {
        await correr({ method: 'POST' });
        await correr({ tenant: undefined });
        expect(TemaTemporadaService.getActivoPanel).not.toHaveBeenCalled();
    });

    it('si falla, no rompe la página', async () => {
        const log = jest.spyOn(console, 'error').mockImplementation(() => {});
        TemaTemporadaService.getActivoPanel.mockRejectedValue(new Error('boom'));
        const { res, next } = await correr({});
        expect(res.locals.temaPanel).toBeUndefined();
        expect(next).toHaveBeenCalledTimes(1);
        log.mockRestore();
    });
});
