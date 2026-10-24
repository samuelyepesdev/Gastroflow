/**
 * PermisosUsuarioService: permisos efectivos = rol + concedidos - denegados, con el plan como
 * techo para el admin del restaurante. La BD y los add-ons van simulados.
 */
jest.mock('../../../config/database', () => ({ query: jest.fn(), getConnection: jest.fn() }));
jest.mock('../../../repositories/Admin/AddonRepository', () => ({ getByTenant: jest.fn() }));

const db = require('../../../config/database');
const AddonRepository = require('../../../repositories/Admin/AddonRepository');
const PermisosUsuarioService = require('../../../services/Shared/PermisosUsuarioService');
const { PERMISSION_TO_MODULE } = require('../../../utils/planPermissions');

const { combinar, aplicarTechoDePlan } = PermisosUsuarioService;

/** Simula la BD según el SQL que llegue (no depende del orden de las consultas). */
function simularBd({ rolPerms = [], excepciones = [], plan = null, usuario = null, rolesExtra = [] }) {
    db.query.mockImplementation(async sql => {
        if (sql.includes('FROM usuarios u')) {
            return [usuario ? [usuario] : []];
        }
        if (sql.includes('FROM usuario_roles')) {
            return [rolesExtra.map(rol_id => ({ rol_id }))];
        }
        if (sql.includes('rol_permisos')) {
            return [rolPerms.map(nombre => ({ nombre }))];
        }
        if (sql.includes('FROM user_permisos')) {
            return [excepciones];
        }
        if (sql.includes('FROM tenants t')) {
            return [plan ? [plan] : []];
        }
        throw new Error(`SQL inesperado: ${sql}`);
    });
}

const ctxMesero = { rolIds: [3], rolNombre: 'mesero', tenantId: 5 };
const ctxAdmin = { rolIds: [2], rolNombre: 'admin', tenantId: 5 };
const planBasico = { slug: 'basico', nombre: 'Básico', caracteristicas: JSON.stringify(['productos', 'clientes']) };
const concede = nombre => ({ nombre, efecto: 'conceder' });
const deniega = nombre => ({ nombre, efecto: 'denegar' });
const ordenados = r => [...r.permisos].sort();

beforeEach(() => {
    jest.resetAllMocks();
    AddonRepository.getByTenant.mockResolvedValue([]);
});

describe('combinar / aplicarTechoDePlan (puras)', () => {
    test('suma concedidos y quita denegados; denegar gana siempre', () => {
        expect(combinar({ base: ['a', 'b'], concedidos: ['c', 'b'], denegados: ['a', 'c'] })).toEqual(['b']);
        expect(combinar({ base: [] })).toEqual([]);
    });

    test('el techo quita permisos de módulos fuera del plan y deja los que no tienen módulo', () => {
        const plan = { slug: 'basico', caracteristicas: ['productos'] };
        expect(aplicarTechoDePlan(['productos.ver', 'analitica.ver', 'soporte.ver'], plan, [])).toEqual([
            'productos.ver',
            'soporte.ver'
        ]);
        expect(aplicarTechoDePlan(['analitica.ver'], plan, ['analitica'])).toEqual(['analitica.ver']);
        expect(aplicarTechoDePlan(['analitica.ver'], null, [])).toEqual(['analitica.ver']);
    });
});

describe('usuario con rol que no es admin del restaurante', () => {
    test('sin excepciones tiene exactamente los permisos de su rol', async () => {
        simularBd({ rolPerms: ['productos.ver', 'clientes.ver'] });
        const r = await PermisosUsuarioService.resolver(10, ctxMesero);
        expect(ordenados(r)).toEqual(['clientes.ver', 'productos.ver']);
        expect(db.query).not.toHaveBeenCalledWith(expect.stringContaining('FROM tenants t'), expect.anything());
    });

    test('un permiso nuevo agregado al rol le llega aunque tenga otras excepciones (el bug original)', async () => {
        simularBd({
            rolPerms: ['productos.ver', 'clientes.ver', 'fidelizacion.ver'],
            excepciones: [concede('analitica.ver')]
        });
        const r = await PermisosUsuarioService.resolver(10, ctxMesero);
        expect(r.permisos).toEqual(expect.arrayContaining(['fidelizacion.ver', 'analitica.ver', 'productos.ver']));
    });

    test('una denegación quita un permiso del rol y deja los demás', async () => {
        simularBd({ rolPerms: ['productos.ver', 'clientes.ver'], excepciones: [deniega('clientes.ver')] });
        const r = await PermisosUsuarioService.resolver(10, ctxMesero);
        expect(r.permisos).toEqual(['productos.ver']);
        expect(r.denegados).toEqual(['clientes.ver']);
    });

    test('puede quedar sin ningún permiso (antes no se podía expresar)', async () => {
        simularBd({ rolPerms: ['productos.ver'], excepciones: [deniega('productos.ver')] });
        expect((await PermisosUsuarioService.resolver(10, ctxMesero)).permisos).toEqual([]);
    });

    test('una concesión no puede ganarle a una denegación del mismo permiso', async () => {
        simularBd({ rolPerms: [], excepciones: [concede('x.ver'), deniega('x.ver')] });
        expect((await PermisosUsuarioService.resolver(10, ctxMesero)).permisos).toEqual([]);
    });
});

describe('admin del restaurante: el plan manda', () => {
    test('no tiene permisos de módulos que su plan no incluye aunque su rol los tenga', async () => {
        simularBd({ rolPerms: ['productos.ver', 'analitica.ver', 'soporte.ver'], plan: planBasico });
        const r = await PermisosUsuarioService.resolver(1, ctxAdmin);
        expect(r.permisos).toEqual(expect.arrayContaining(['productos.ver', 'soporte.ver']));
        expect(r.permisos).not.toContain('analitica.ver');
        expect(r.permisos).not.toContain('inventario.ver');
    });

    test('recibe todo lo que el plan incluye aunque su rol no lo traiga (lo que antes hacía la sincronización)', async () => {
        simularBd({ rolPerms: ['productos.ver'], plan: planBasico });
        const r = await PermisosUsuarioService.resolver(1, ctxAdmin);
        expect(r.permisos).toEqual(expect.arrayContaining(['clientes.ver', 'clientes.crear', 'productos.editar']));
    });

    test('una concesión explícita supera el plan (desbloquear un módulo a un usuario)', async () => {
        simularBd({
            rolPerms: ['productos.ver', 'analitica.ver'],
            excepciones: [concede('analitica.ver')],
            plan: planBasico
        });
        expect((await PermisosUsuarioService.resolver(1, ctxAdmin)).permisos).toContain('analitica.ver');
    });

    test('un permiso nuevo del rol llega solo si el módulo está en su plan', async () => {
        simularBd({ rolPerms: ['productos.ver', 'clientes.ver', 'inventario.ver'], plan: planBasico });
        const r = await PermisosUsuarioService.resolver(1, ctxAdmin);
        expect(r.permisos).toContain('clientes.ver');
        expect(r.permisos).not.toContain('inventario.ver');
    });

    test('un add-on del tenant sube el techo', async () => {
        AddonRepository.getByTenant.mockResolvedValue([{ slug: 'inventario' }]);
        simularBd({ rolPerms: ['productos.ver', 'inventario.ver'], plan: planBasico });
        expect((await PermisosUsuarioService.resolver(1, ctxAdmin)).permisos).toContain('inventario.ver');
    });

    test('una denegación aplica también al admin', async () => {
        simularBd({
            rolPerms: ['productos.ver', 'clientes.ver'],
            excepciones: [deniega('clientes.ver')],
            plan: planBasico
        });
        const r = await PermisosUsuarioService.resolver(1, ctxAdmin);
        expect(r.permisos).toContain('productos.ver');
        expect(r.permisos).not.toContain('clientes.ver');
    });

    test('sin plan o sin módulos definidos no hay techo (igual que planHasModule)', async () => {
        simularBd({ rolPerms: ['analitica.ver'], plan: null });
        expect((await PermisosUsuarioService.resolver(1, ctxAdmin)).permisos).toContain('analitica.ver');
        simularBd({ rolPerms: ['analitica.ver'], plan: { slug: 'x', nombre: 'X', caracteristicas: null } });
        expect((await PermisosUsuarioService.resolver(1, ctxAdmin)).permisos).toContain('analitica.ver');
    });

    test('la base devuelta (para el panel) ya incluye el techo y lo que da el plan, sin excepciones', async () => {
        simularBd({
            rolPerms: ['analitica.ver'],
            excepciones: [concede('inventario.ver'), deniega('productos.ver')],
            plan: planBasico
        });
        const r = await PermisosUsuarioService.resolver(1, ctxAdmin);
        expect(r.base).toContain('productos.ver');
        expect(r.base).not.toContain('analitica.ver');
        expect(r.base).not.toContain('inventario.ver');
        expect(r.permisos).toContain('inventario.ver');
        expect(r.permisos).not.toContain('productos.ver');
    });

    test('Premium y Definitivo: todos los permisos conocidos más los del rol, sin aplicar excepciones', async () => {
        simularBd({
            rolPerms: ['soporte.ver'],
            excepciones: [deniega('productos.ver')],
            plan: { slug: 'premium', nombre: 'Premium', caracteristicas: JSON.stringify(['productos']) }
        });
        const r = await PermisosUsuarioService.resolver(1, ctxAdmin);
        expect(r.premium).toBe(true);
        expect(r.permisos).toEqual(expect.arrayContaining([...Object.keys(PERMISSION_TO_MODULE), 'soporte.ver']));
        expect(r.permisos).toContain('productos.ver');
    });

    test('un admin sin restaurante (tenant null) no consulta plan ni tiene techo', async () => {
        simularBd({ rolPerms: ['analitica.ver'] });
        const r = await PermisosUsuarioService.resolver(1, { rolIds: [2], rolNombre: 'admin', tenantId: null });
        expect(r.permisos).toEqual(['analitica.ver']);
    });
});

describe('carga del contexto cuando no se entrega', () => {
    test('une el rol principal con los roles adicionales', async () => {
        simularBd({
            usuario: { rol_id: 3, rol_nombre: 'mesero', tenant_id: 5 },
            rolesExtra: [4, 3],
            rolPerms: ['productos.ver']
        });
        await PermisosUsuarioService.resolver(10);
        const llamada = db.query.mock.calls.find(([sql]) => sql.includes('rol_permisos'));
        expect(llamada[1]).toEqual([[3, 4]]);
    });

    test('usuario inexistente devuelve null', async () => {
        simularBd({ usuario: null });
        expect(await PermisosUsuarioService.resolver(999)).toBeNull();
    });
});
