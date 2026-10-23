/**
 * PermisosMasivosService: el plan de cambios (qué se guarda y qué se borra por usuario) es la parte
 * delicada, porque la vista previa y la aplicación comparten el mismo cálculo. La BD va simulada.
 */
jest.mock('../../../config/database', () => ({ query: jest.fn(), getConnection: jest.fn() }));
jest.mock('../../../services/Shared/CacheService', () => ({ deleteByPrefix: jest.fn(), delete: jest.fn() }));
jest.mock('../../../services/Shared/PermisosUsuarioService', () => ({ resolver: jest.fn() }));
jest.mock('../../../repositories/Admin/PermisoRepository', () => ({
    getAllRoles: jest.fn(),
    getPermisoIdsByRol: jest.fn(),
    setPermisosForRol: jest.fn(),
    reiniciarExcepciones: jest.fn()
}));
jest.mock('../../../services/Admin/TenantAuditService', () => ({ log: jest.fn() }));

const db = require('../../../config/database');
const CacheService = require('../../../services/Shared/CacheService');
const PermisosUsuarioService = require('../../../services/Shared/PermisosUsuarioService');
const PermisoRepository = require('../../../repositories/Admin/PermisoRepository');
const TenantAuditService = require('../../../services/Admin/TenantAuditService');
const Servicio = require('../../../services/Admin/PermisosMasivosService');

// Permisos: 1 = productos.ver, 2 = fidelizacion.ver, 3 = analitica.ver
const PERMISOS = [
    { id: 1, nombre: 'productos.ver' },
    { id: 2, nombre: 'fidelizacion.ver' },
    { id: 3, nombre: 'analitica.ver' }
];

/**
 * usuarios: filas de usuarios del alcance. rolPerms: { rol_id: [permiso_id] }.
 * excepciones: filas de user_permisos.
 */
function simularBd({ usuarios, rolPerms = {}, excepciones = [] }) {
    const conexion = {
        beginTransaction: jest.fn(),
        commit: jest.fn(),
        rollback: jest.fn(),
        release: jest.fn(),
        query: jest.fn()
    };
    db.getConnection.mockResolvedValue(conexion);
    db.query.mockImplementation(async (sql, params) => {
        if (sql.includes('FROM usuarios u') && sql.includes('INNER JOIN tenants')) {
            return [usuarios];
        }
        if (sql.includes('FROM usuario_roles')) {
            return [[]];
        }
        if (sql.includes('FROM user_permisos WHERE user_id IN')) {
            return [excepciones];
        }
        if (sql.includes('FROM rol_permisos')) {
            return [
                Object.entries(rolPerms).flatMap(([rol_id, ps]) =>
                    ps.map(permiso_id => ({ rol_id: Number(rol_id), permiso_id }))
                )
            ];
        }
        if (sql.startsWith('SELECT id, nombre FROM permisos')) {
            return [PERMISOS];
        }
        if (sql.startsWith('SELECT id FROM permisos WHERE id IN')) {
            return [PERMISOS.filter(p => params[0].includes(p.id)).map(p => ({ id: p.id }))];
        }
        if (sql.startsWith('SELECT nombre FROM permisos')) {
            return [PERMISOS.map(p => ({ nombre: p.nombre }))];
        }
        return [[]];
    });
    return conexion;
}

const cajero = { id: 10, username: 'caja1', tenant_id: 1, tenant_nombre: 'Uno', rol_id: 4, rol_nombre: 'cajero' };
const admin = { id: 20, username: 'adm1', tenant_id: 1, tenant_nombre: 'Uno', rol_id: 2, rol_nombre: 'admin' };
const base = { roles: ['cajero'], modo: 'todos', permiso_ids: [2] };

beforeEach(() => {
    jest.resetAllMocks();
    TenantAuditService.log.mockResolvedValue();
});

describe('validación', () => {
    test.each([
        [{ ...base, accion: 'otra' }, 'Acción inválida'],
        [{ ...base, accion: 'conceder', roles: [] }, 'Elige al menos un rol'],
        [{ ...base, accion: 'conceder', roles: ['superadmin'] }, 'Elige al menos un rol'],
        [{ ...base, accion: 'conceder', permiso_ids: [] }, 'Elige al menos un permiso'],
        [{ ...base, accion: 'conceder', modo: 'planes', plan_ids: [] }, 'Elige al menos un plan'],
        [{ ...base, accion: 'conceder', modo: 'manual', tenant_ids: [] }, 'Elige al menos un restaurante'],
        [{ ...base, accion: 'conceder', modo: 'raro' }, 'Alcance inválido']
    ])('rechaza %j', async (params, mensaje) => {
        simularBd({ usuarios: [] });
        await expect(Servicio.previsualizar(params)).rejects.toMatchObject({ status: 400, message: mensaje });
    });

    test('rechaza permisos que no existen', async () => {
        simularBd({ usuarios: [] });
        await expect(
            Servicio.previsualizar({ ...base, accion: 'conceder', permiso_ids: [2, 999] })
        ).rejects.toMatchObject({
            status: 400
        });
    });
});

describe('plan de cambios (usuarios que no son admin)', () => {
    test('conceder un permiso que el rol no da guarda una excepción', async () => {
        simularBd({ usuarios: [cajero], rolPerms: { 4: [1] } });
        const plan = await Servicio.planificar({ ...base, accion: 'conceder' });
        expect(plan.cambios[0].guardar).toEqual([[10, 2, 'conceder']]);
    });

    test('conceder lo que el rol ya da no guarda nada (excepciones mínimas)', async () => {
        simularBd({ usuarios: [cajero], rolPerms: { 4: [1, 2] } });
        expect((await Servicio.planificar({ ...base, accion: 'conceder' })).cambios).toEqual([]);
    });

    test('conceder lo que el rol da pero estaba denegado borra la denegación', async () => {
        simularBd({
            usuarios: [cajero],
            rolPerms: { 4: [2] },
            excepciones: [{ user_id: 10, permiso_id: 2, efecto: 'denegar' }]
        });
        const plan = await Servicio.planificar({ ...base, accion: 'conceder' });
        expect(plan.cambios[0]).toMatchObject({ guardar: [], borrar: [2] });
    });

    test('denegar lo que el rol da guarda una denegación; lo que no da, nada', async () => {
        simularBd({ usuarios: [cajero], rolPerms: { 4: [2] } });
        expect((await Servicio.planificar({ ...base, accion: 'denegar' })).cambios[0].guardar).toEqual([
            [10, 2, 'denegar']
        ]);
        simularBd({ usuarios: [cajero], rolPerms: { 4: [1] } });
        expect((await Servicio.planificar({ ...base, accion: 'denegar' })).cambios).toEqual([]);
    });

    test('denegar convierte una concesión previa en denegación o la borra si el rol no lo da', async () => {
        simularBd({
            usuarios: [cajero],
            rolPerms: { 4: [1] },
            excepciones: [{ user_id: 10, permiso_id: 2, efecto: 'conceder' }]
        });
        const plan = await Servicio.planificar({ ...base, accion: 'denegar' });
        expect(plan.cambios[0]).toMatchObject({ guardar: [], borrar: [2] });
    });

    test('volver al estándar con permisos borra solo esos; sin permisos borra todas las excepciones', async () => {
        const excepciones = [
            { user_id: 10, permiso_id: 2, efecto: 'conceder' },
            { user_id: 10, permiso_id: 3, efecto: 'conceder' }
        ];
        simularBd({ usuarios: [cajero], excepciones });
        expect((await Servicio.planificar({ ...base, accion: 'quitar' })).cambios[0].borrar).toEqual([2]);
        simularBd({ usuarios: [cajero], excepciones });
        expect(
            (await Servicio.planificar({ roles: ['cajero'], modo: 'todos', accion: 'quitar' })).cambios[0].borrar
        ).toEqual([2, 3]);
    });

    test('es idempotente: aplicar de nuevo lo ya concedido no cambia nada', async () => {
        simularBd({ usuarios: [cajero], excepciones: [{ user_id: 10, permiso_id: 2, efecto: 'conceder' }] });
        expect((await Servicio.planificar({ ...base, accion: 'conceder' })).cambios).toEqual([]);
    });
});

describe('admin del restaurante', () => {
    test('usa su base real (rol + plan) para decidir: conceder fuera del plan sí guarda', async () => {
        PermisosUsuarioService.resolver.mockResolvedValue({ premium: false, base: ['productos.ver'] });
        simularBd({ usuarios: [admin], rolPerms: { 2: [1, 2, 3] } });
        const plan = await Servicio.planificar({
            roles: ['admin'],
            modo: 'todos',
            accion: 'conceder',
            permiso_ids: [3]
        });
        expect(plan.cambios[0].guardar).toEqual([[20, 3, 'conceder']]);
    });

    test('los admins Premium/Definitivo se omiten (las excepciones no les aplican)', async () => {
        PermisosUsuarioService.resolver.mockResolvedValue({ premium: true, base: [] });
        simularBd({ usuarios: [admin] });
        const plan = await Servicio.planificar({
            roles: ['admin'],
            modo: 'todos',
            accion: 'denegar',
            permiso_ids: [1]
        });
        expect(plan.cambios).toEqual([]);
        expect(plan.premium).toBe(1);
    });

    test('admins del mismo restaurante y roles comparten un solo cálculo de base', async () => {
        PermisosUsuarioService.resolver.mockResolvedValue({ premium: false, base: [] });
        simularBd({ usuarios: [admin, { ...admin, id: 21, username: 'adm2' }] });
        await Servicio.planificar({ roles: ['admin'], modo: 'todos', accion: 'conceder', permiso_ids: [1] });
        expect(PermisosUsuarioService.resolver).toHaveBeenCalledTimes(1);
    });
});

describe('aplicar', () => {
    test('escribe en una transacción, limpia la caché y deja auditoría', async () => {
        const conexion = simularBd({ usuarios: [cajero], rolPerms: { 4: [1] } });
        const r = await Servicio.aplicar({ ...base, accion: 'conceder' }, { superadminId: 7 });
        expect(conexion.beginTransaction).toHaveBeenCalled();
        expect(conexion.query).toHaveBeenCalledWith(expect.stringContaining('ON DUPLICATE KEY UPDATE'), [
            [[10, 2, 'conceder']]
        ]);
        expect(conexion.commit).toHaveBeenCalled();
        expect(CacheService.deleteByPrefix).toHaveBeenCalledWith('user:ctx:');
        expect(TenantAuditService.log).toHaveBeenCalledWith(
            expect.objectContaining({ userId: 7, accion: 'permisos.masivo.conceder' })
        );
        expect(r).toMatchObject({ usuariosConCambios: 1, restaurantesConCambios: 1 });
    });

    test('si falla la escritura hace rollback y no limpia caché ni audita', async () => {
        const conexion = simularBd({ usuarios: [cajero], rolPerms: { 4: [1] } });
        conexion.query.mockRejectedValue(new Error('boom'));
        await expect(Servicio.aplicar({ ...base, accion: 'conceder' })).rejects.toThrow('boom');
        expect(conexion.rollback).toHaveBeenCalled();
        expect(conexion.release).toHaveBeenCalled();
        expect(CacheService.deleteByPrefix).not.toHaveBeenCalled();
        expect(TenantAuditService.log).not.toHaveBeenCalled();
    });

    test('sin nada que cambiar no abre transacción', async () => {
        simularBd({ usuarios: [cajero], rolPerms: { 4: [1, 2] } });
        await Servicio.aplicar({ ...base, accion: 'conceder' });
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    test('un fallo de auditoría no tumba una operación ya aplicada', async () => {
        simularBd({ usuarios: [cajero], rolPerms: { 4: [1] } });
        TenantAuditService.log.mockRejectedValue(new Error('sin auditoría'));
        jest.spyOn(console, 'error').mockImplementation(() => {});
        await expect(Servicio.aplicar({ ...base, accion: 'conceder' })).resolves.toMatchObject({
            usuariosConCambios: 1
        });
        console.error.mockRestore();
    });
});

describe('roles', () => {
    test('no permite editar el rol superadmin', async () => {
        db.query.mockResolvedValue([[{ id: 1, nombre: 'superadmin' }]]);
        await expect(Servicio.guardarPermisosRol(1, [1])).rejects.toMatchObject({ status: 400 });
        expect(PermisoRepository.setPermisosForRol).not.toHaveBeenCalled();
    });

    test('guarda, devuelve lo agregado y quitado, y audita', async () => {
        simularBd({ usuarios: [] });
        const consulta = db.query.getMockImplementation();
        db.query.mockImplementation(async (sql, p) =>
            sql.startsWith('SELECT id, nombre FROM roles') ? [[{ id: 4, nombre: 'cajero' }]] : consulta(sql, p)
        );
        PermisoRepository.getPermisoIdsByRol.mockResolvedValue([1, 2]);
        const r = await Servicio.guardarPermisosRol(4, [2, 3], { superadminId: 7 });
        expect(PermisoRepository.setPermisosForRol).toHaveBeenCalledWith(4, [2, 3]);
        expect(r.agregados.length).toBeGreaterThan(0);
        expect(TenantAuditService.log).toHaveBeenCalledWith(expect.objectContaining({ accion: 'permisos.rol' }));
    });

    test('si no cambia nada no escribe', async () => {
        simularBd({ usuarios: [] });
        const consulta = db.query.getMockImplementation();
        db.query.mockImplementation(async (sql, p) =>
            sql.startsWith('SELECT id, nombre FROM roles') ? [[{ id: 4, nombre: 'cajero' }]] : consulta(sql, p)
        );
        PermisoRepository.getPermisoIdsByRol.mockResolvedValue([1, 2]);
        await Servicio.guardarPermisosRol(4, [2, 1]);
        expect(PermisoRepository.setPermisosForRol).not.toHaveBeenCalled();
    });
});

describe('reiniciarUsuarios', () => {
    test('quita las excepciones y audita; rechaza una lista vacía', async () => {
        PermisoRepository.reiniciarExcepciones.mockResolvedValue(3);
        const r = await Servicio.reiniciarUsuarios([5, '6', 'x'], { superadminId: 7 });
        expect(PermisoRepository.reiniciarExcepciones).toHaveBeenCalledWith([5, 6]);
        expect(r).toEqual({ usuarios: 2, excepcionesQuitadas: 3 });
        await expect(Servicio.reiniciarUsuarios([])).rejects.toMatchObject({ status: 400 });
    });
});
