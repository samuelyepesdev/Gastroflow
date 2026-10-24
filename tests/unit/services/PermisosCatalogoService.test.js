/**
 * PermisosCatalogoService: crea lo que falta, da roles por defecto solo a lo recién creado,
 * y nunca borra ni deshace ajustes manuales de roles. La BD va simulada.
 */
jest.mock('../../../config/database', () => ({ query: jest.fn() }));

const db = require('../../../config/database');
const PermisosCatalogoService = require('../../../services/Shared/PermisosCatalogoService');

const catalogo = [
    { nombre: 'a.ver', descripcion: 'Ver A', roles: ['admin', 'cajero'] },
    { nombre: 'b.ver', descripcion: 'Ver B nueva descripción', roles: ['admin'] },
    { nombre: 'c.ver', descripcion: 'Ver C', roles: ['admin', 'fantasma'] }
];
const roles = [
    { id: 1, nombre: 'admin' },
    { id: 2, nombre: 'cajero' }
];

/** existentes: filas de `permisos`. insertIgnore decide si el INSERT IGNORE crea la fila. */
function simularBd({ existentes, insertIgnore = () => ({ affectedRows: 1, insertId: 100 }) }) {
    db.query.mockImplementation(async (sql, params) => {
        if (sql.startsWith('SELECT id, nombre, descripcion FROM permisos')) {
            return [existentes];
        }
        if (sql.startsWith('SELECT id, nombre FROM roles')) {
            return [roles];
        }
        if (sql.startsWith('INSERT IGNORE INTO permisos')) {
            return [insertIgnore(params)];
        }
        return [{ affectedRows: 1 }];
    });
}
const llamadas = prefijo => db.query.mock.calls.filter(([sql]) => sql.startsWith(prefijo));

beforeEach(() => jest.resetAllMocks());

test('crea los permisos que faltan y los asigna a sus roles por defecto', async () => {
    simularBd({ existentes: [{ id: 5, nombre: 'a.ver', descripcion: 'Ver A' }] });
    const r = await PermisosCatalogoService.sincronizar({ catalogo });
    expect(r.creados).toEqual(['b.ver', 'c.ver']);
    expect(llamadas('INSERT IGNORE INTO rol_permisos').map(([, p]) => p)).toEqual([
        [1, 100],
        [1, 100]
    ]);
});

test('un permiso que ya existía NO recibe roles (no se deshace lo que se quitó a mano)', async () => {
    simularBd({
        existentes: catalogo.map((p, i) => ({ id: i + 1, nombre: p.nombre, descripcion: p.descripcion }))
    });
    const r = await PermisosCatalogoService.sincronizar({ catalogo });
    expect(r.creados).toEqual([]);
    expect(llamadas('INSERT IGNORE INTO rol_permisos')).toHaveLength(0);
    expect(llamadas('INSERT IGNORE INTO permisos')).toHaveLength(0);
});

test('actualiza la descripción de los existentes cuando el catálogo cambió', async () => {
    simularBd({
        existentes: [
            { id: 1, nombre: 'a.ver', descripcion: 'Ver A' },
            { id: 2, nombre: 'b.ver', descripcion: 'vieja' },
            { id: 3, nombre: 'c.ver', descripcion: 'Ver C' }
        ]
    });
    const r = await PermisosCatalogoService.sincronizar({ catalogo });
    expect(r.descripcionesActualizadas).toEqual(['b.ver']);
    expect(llamadas('UPDATE permisos SET descripcion')[0][1]).toEqual(['Ver B nueva descripción', 2]);
});

test('si otra instancia lo creó a la vez (affectedRows 0) no duplica la asignación de roles', async () => {
    simularBd({ existentes: [], insertIgnore: () => ({ affectedRows: 0, insertId: 0 }) });
    await PermisosCatalogoService.sincronizar({ catalogo });
    expect(llamadas('INSERT IGNORE INTO rol_permisos')).toHaveLength(0);
});

test('avisa de los roles del catálogo que no existen en la BD y sigue con los demás', async () => {
    simularBd({ existentes: [] });
    const r = await PermisosCatalogoService.sincronizar({ catalogo });
    expect(r.rolesInexistentes).toEqual(['fantasma']);
});

test('devuelve como huérfanos los permisos de la BD que el catálogo no conoce y no los borra', async () => {
    simularBd({
        existentes: [
            ...catalogo.map((p, i) => ({ id: i + 1, nombre: p.nombre, descripcion: p.descripcion })),
            { id: 9, nombre: 'viejo.ver', descripcion: 'x' }
        ]
    });
    const r = await PermisosCatalogoService.sincronizar({ catalogo });
    expect(r.huerfanos).toEqual(['viejo.ver']);
    expect(db.query.mock.calls.some(([sql]) => /DELETE/i.test(sql))).toBe(false);
});

test('dry-run informa pero no escribe nada', async () => {
    simularBd({ existentes: [{ id: 2, nombre: 'b.ver', descripcion: 'vieja' }] });
    const r = await PermisosCatalogoService.sincronizar({ catalogo, dryRun: true });
    expect(r.creados).toEqual(['a.ver', 'c.ver']);
    expect(r.descripcionesActualizadas).toEqual(['b.ver']);
    expect(db.query.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
});
