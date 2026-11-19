jest.mock('../../../config/database', () => ({ query: jest.fn() }));

const db = require('../../../config/database');
const CacheService = require('../../../services/Shared/CacheService');
const MenuPersonalService = require('../../../services/Shared/MenuPersonalService');

describe('MenuPersonalService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        CacheService.clear();
        db.query.mockResolvedValue([{ affectedRows: 1 }]);
    });

    it('guarda solo claves válidas, sin repetir, como JSON', async () => {
        const r = await MenuPersonalService.guardar(7, ['finanzas', 'bonos', 'finanzas', 'configuracion', 'x']);
        expect(r).toEqual(['finanzas', 'bonos']);
        expect(db.query).toHaveBeenCalledWith('UPDATE usuarios SET nav_oculto = ? WHERE id = ?', [
            JSON.stringify(['finanzas', 'bonos']),
            7
        ]);
    });

    it('una lista vacía guarda NULL (muestra todo)', async () => {
        await MenuPersonalService.guardar(7, []);
        expect(db.query.mock.calls[0][1]).toEqual([null, 7]);
    });

    it('restablecer equivale a guardar vacío', async () => {
        await expect(MenuPersonalService.restablecer(7)).resolves.toEqual([]);
        expect(db.query.mock.calls[0][1]).toEqual([null, 7]);
    });

    it('rechaza lo que no es una lista', async () => {
        await expect(MenuPersonalService.guardar(7, 'finanzas')).rejects.toMatchObject({ code: 'MENU_LISTA_INVALIDA' });
        await expect(MenuPersonalService.guardar(7, undefined)).rejects.toMatchObject({ statusCode: 400 });
        expect(db.query).not.toHaveBeenCalled();
    });

    it('invalida el contexto cacheado del usuario para que el cambio se vea de inmediato', async () => {
        CacheService.set('user:ctx:7', { id: 7 }, 45);
        await MenuPersonalService.guardar(7, ['pos']);
        expect(CacheService.get('user:ctx:7')).toBeNull();
    });

    it('getOcultos lee y normaliza lo guardado', async () => {
        db.query.mockResolvedValue([[{ nav_oculto: '["mesas","hackeo","pos"]' }]]);
        await expect(MenuPersonalService.getOcultos(7)).resolves.toEqual(['mesas', 'pos']);
        db.query.mockResolvedValue([[{ nav_oculto: null }]]);
        await expect(MenuPersonalService.getOcultos(7)).resolves.toEqual([]);
        db.query.mockResolvedValue([[]]);
        await expect(MenuPersonalService.getOcultos(99)).resolves.toEqual([]);
    });
});
