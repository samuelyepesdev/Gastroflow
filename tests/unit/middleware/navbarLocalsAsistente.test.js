jest.mock('../../../services/Tenant/Asistente/llm', () => ({ asistenteConfigurado: jest.fn() }));

const navbarLocals = require('../../../middleware/navbarLocals');
const { asistenteConfigurado } = require('../../../services/Tenant/Asistente/llm');

function navDe({ permisos = ['asistente.usar'], addons = ['asistente'], rol = 'mesero', configurado = true } = {}) {
    asistenteConfigurado.mockReturnValue(configurado);
    const req = {
        user: { rol, permisos, nombre_completo: 'Ana Pérez' },
        tenant: { id: 5, nombre: 'Rest', addonSlugs: addons, config: null }
    };
    const res = { locals: { allowedByPlan: { mesas: true } } };
    navbarLocals(req, res, () => {});
    return res.locals.nav;
}

describe('navbarLocals / botón del asistente', () => {
    beforeEach(() => jest.resetAllMocks());

    it('se muestra solo con add-on, permiso y clave configurada', () => {
        expect(navDe().can.asistente).toBe(true);
    });

    it.each([
        ['sin add-on', { addons: [] }],
        ['sin permiso', { permisos: [] }],
        ['sin clave del proveedor', { configurado: false }]
    ])('no se muestra %s', (_n, extra) => {
        expect(navDe(extra).can.asistente).toBe(false);
    });

    it('un admin con el permiso pero sin add-on tampoco lo ve (el plan no basta)', () => {
        expect(navDe({ rol: 'admin', addons: [] }).can.asistente).toBe(false);
    });
});
