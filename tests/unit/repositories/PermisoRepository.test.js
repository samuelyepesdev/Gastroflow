/**
 * PermisoRepository (permisos por usuario): el panel manda lo que quedó marcado y el repositorio
 * guarda solo las diferencias contra lo que le corresponde por rol y plan.
 */
jest.mock('../../../config/database', () => ({ query: jest.fn(), getConnection: jest.fn() }));
jest.mock('../../../services/Shared/PermisosUsuarioService', () => ({ resolver: jest.fn() }));
jest.mock('../../../services/Shared/CacheService', () => ({ delete: jest.fn(), deleteByPrefix: jest.fn() }));

const db = require('../../../config/database');
const PermisosUsuarioService = require('../../../services/Shared/PermisosUsuarioService');
const CacheService = require('../../../services/Shared/CacheService');
const PermisoRepository = require('../../../repositories/Admin/PermisoRepository');

// Catálogo simulado: id por nombre
const CATALOGO = { 'productos.ver': 1, 'clientes.ver': 2, 'analitica.ver': 3, 'inventario.ver': 4 };
let conn;

beforeEach(() => {
    jest.resetAllMocks();
    conn = {
        beginTransaction: jest.fn(),
        commit: jest.fn(),
        rollback: jest.fn(),
        release: jest.fn(),
        query: jest.fn()
    };
    db.getConnection.mockResolvedValue(conn);
    db.query.mockImplementation(async (sql, params) => {
        if (sql.includes('FROM permisos WHERE nombre IN')) {
            return [(params[0] || []).map(n => ({ id: CATALOGO[n] })).filter(r => r.id)];
        }
        throw new Error(`SQL inesperado: ${sql}`);
    });
});

const filasInsertadas = () => {
    const insert = conn.query.mock.calls.find(([sql]) => sql.startsWith('INSERT'));
    return insert ? insert[1][0] : [];
};

describe('setPermisosForUser', () => {
    test('sin cambios respecto a su rol no queda ninguna excepción (sigue al rol)', async () => {
        PermisosUsuarioService.resolver.mockResolvedValue({ base: ['productos.ver', 'clientes.ver'] });
        await PermisoRepository.setPermisosForUser(7, [1, 2]);
        expect(conn.query).toHaveBeenCalledWith('DELETE FROM user_permisos WHERE user_id = ?', [7]);
        expect(filasInsertadas()).toEqual([]);
        expect(conn.commit).toHaveBeenCalled();
    });

    test('lo marcado de más es una concesión y lo desmarcado una denegación', async () => {
        PermisosUsuarioService.resolver.mockResolvedValue({ base: ['productos.ver', 'clientes.ver'] });
        await PermisoRepository.setPermisosForUser(7, [1, 3]);
        expect(filasInsertadas()).toEqual(
            expect.arrayContaining([
                [7, 3, 'conceder'],
                [7, 2, 'denegar']
            ])
        );
        expect(filasInsertadas()).toHaveLength(2);
    });

    test('desmarcar todo deja al usuario sin permisos (denegando cada uno de su base)', async () => {
        PermisosUsuarioService.resolver.mockResolvedValue({ base: ['productos.ver', 'clientes.ver'] });
        await PermisoRepository.setPermisosForUser(7, []);
        expect(filasInsertadas()).toEqual([
            [7, 1, 'denegar'],
            [7, 2, 'denegar']
        ]);
    });

    test('para un admin la base ya trae el techo del plan: marcar un módulo fuera del plan es concesión', async () => {
        PermisosUsuarioService.resolver.mockResolvedValue({ base: ['productos.ver'] });
        await PermisoRepository.setPermisosForUser(7, [1, 3]);
        expect(filasInsertadas()).toEqual([[7, 3, 'conceder']]);
    });

    test('limpia el contexto en caché del usuario', async () => {
        PermisosUsuarioService.resolver.mockResolvedValue({ base: [] });
        await PermisoRepository.setPermisosForUser(7, []);
        expect(CacheService.delete).toHaveBeenCalledWith('user:ctx:7');
    });

    test('si falla al guardar hace rollback y no deja el usuario a medias', async () => {
        PermisosUsuarioService.resolver.mockResolvedValue({ base: [] });
        conn.query.mockResolvedValueOnce([{}]); // DELETE
        conn.query.mockRejectedValueOnce(new Error('boom')); // INSERT
        await expect(PermisoRepository.setPermisosForUser(7, [1])).rejects.toThrow('boom');
        expect(conn.rollback).toHaveBeenCalled();
        expect(conn.commit).not.toHaveBeenCalled();
        expect(conn.release).toHaveBeenCalled();
    });

    test('usuario inexistente', async () => {
        PermisosUsuarioService.resolver.mockResolvedValue(null);
        await expect(PermisoRepository.setPermisosForUser(7, [1])).rejects.toThrow('Usuario no encontrado');
    });
});

describe('lectura y reinicio', () => {
    test('el panel muestra los permisos efectivos como ids', async () => {
        PermisosUsuarioService.resolver.mockResolvedValue({
            permisos: ['clientes.ver', 'analitica.ver', 'inexistente.ver']
        });
        expect((await PermisoRepository.getEffectivePermisoIdsByUser(7)).sort()).toEqual([2, 3]);
    });

    test('reiniciarExcepciones borra las filas y limpia el caché de cada usuario', async () => {
        db.query.mockResolvedValue([{ affectedRows: 5 }]);
        expect(await PermisoRepository.reiniciarExcepciones([1, 2])).toBe(5);
        expect(CacheService.delete).toHaveBeenCalledWith('user:ctx:1');
        expect(CacheService.delete).toHaveBeenCalledWith('user:ctx:2');
        expect(await PermisoRepository.reiniciarExcepciones([])).toBe(0);
    });
});
