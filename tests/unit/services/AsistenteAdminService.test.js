const AsistenteAdminService = require('../../../services/Admin/AsistenteAdminService');
const AsistenteAdminRepository = require('../../../repositories/Admin/AsistenteAdminRepository');
const AddonRepository = require('../../../repositories/Admin/AddonRepository');
const AddonService = require('../../../services/Admin/AddonService');
const PermisoRepository = require('../../../repositories/Admin/PermisoRepository');
const PermisosUsuarioService = require('../../../services/Shared/PermisosUsuarioService');
const TenantAuditService = require('../../../services/Admin/TenantAuditService');
const { asistenteConfigurado } = require('../../../services/Tenant/Asistente/llm');

jest.mock('../../../repositories/Admin/AsistenteAdminRepository', () => ({
    resumenTenants: jest.fn(),
    guardarNombre: jest.fn(),
    usuarioDelTenant: jest.fn()
}));
jest.mock('../../../repositories/Admin/AddonRepository', () => ({ findAll: jest.fn() }));
jest.mock('../../../services/Admin/AddonService', () => ({ addToTenant: jest.fn(), removeFromTenant: jest.fn() }));
jest.mock('../../../repositories/Admin/PermisoRepository', () => ({
    getUsuariosByTenantId: jest.fn(),
    getExcepcionesByUser: jest.fn(),
    _idsPorNombre: jest.fn(),
    setExcepcionesForUser: jest.fn()
}));
jest.mock('../../../services/Shared/PermisosUsuarioService', () => ({ resolver: jest.fn() }));
jest.mock('../../../services/Admin/TenantAuditService', () => ({ log: jest.fn() }));
jest.mock('../../../services/Tenant/Asistente/llm', () => ({
    asistenteConfigurado: jest.fn(),
    MODELO_DEFECTO: 'modelo-x'
}));

const PERMISO_ID = 77;
const resuelto = (extra = {}) => ({
    permisos: [],
    base: [],
    concedidos: [],
    denegados: [],
    premium: false,
    ...extra
});
const fila = extra => ({
    id: 1,
    nombre: 'Uno',
    tiene_addon: 0,
    nombre_asistente: null,
    usos: 0,
    errores: 0,
    tokens: null,
    ultimo_uso: null,
    ...extra
});

describe('AsistenteAdminService', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        asistenteConfigurado.mockReturnValue(true);
        PermisoRepository._idsPorNombre.mockResolvedValue([PERMISO_ID]);
        TenantAuditService.log.mockResolvedValue();
    });

    describe('resumen', () => {
        it('estado del servidor sin exponer la clave y una fila por restaurante', async () => {
            AsistenteAdminRepository.resumenTenants.mockResolvedValue([
                fila(),
                fila({
                    id: 2,
                    nombre: 'Dos',
                    tiene_addon: 1,
                    nombre_asistente: 'Sazón',
                    usos: 12,
                    errores: 2,
                    tokens: '3400',
                    ultimo_uso: '2026-11-10 12:00:00'
                })
            ]);
            PermisoRepository.getUsuariosByTenantId.mockResolvedValue([{ id: 5, rol_nombre: 'admin', activo: 1 }]);
            PermisosUsuarioService.resolver.mockResolvedValue(resuelto({ permisos: ['asistente.usar'] }));

            const r = await AsistenteAdminService.resumen();

            expect(r.servidor).toEqual({ configurado: true, modelo: 'modelo-x' });
            expect(JSON.stringify(r)).not.toMatch(/gsk_|api_key/i);
            expect(r.restaurantes).toHaveLength(2);
            expect(r.restaurantes[0]).toMatchObject({
                id: 1,
                addon: false,
                nombreAsistente: 'Chef',
                usuariosConAcceso: 0
            });
            expect(r.restaurantes[1]).toMatchObject({
                id: 2,
                addon: true,
                nombreAsistente: 'Sazón',
                usuariosConAcceso: 1,
                usos: 12,
                errores: 2,
                tokens: 3400
            });
            // Sin add-on no se consultan usuarios: el asistente no está disponible allí.
            expect(PermisoRepository.getUsuariosByTenantId).toHaveBeenCalledTimes(1);
            expect(PermisoRepository.getUsuariosByTenantId).toHaveBeenCalledWith(2);
        });
    });

    describe('activarAddon', () => {
        beforeEach(() => {
            AddonRepository.findAll.mockResolvedValue([
                { id: 3, slug: 'otro' },
                { id: 9, slug: 'asistente' }
            ]);
        });

        it('activa y desactiva usando el servicio de add-ons existente', async () => {
            await AsistenteAdminService.activarAddon(2, true, 1);
            await AsistenteAdminService.activarAddon(2, false, 1);

            expect(AddonService.addToTenant).toHaveBeenCalledWith(2, 9, 1);
            expect(AddonService.removeFromTenant).toHaveBeenCalledWith(2, 9, 1);
        });

        it('si el add-on no existe en el catálogo avisa que falta la migración', async () => {
            AddonRepository.findAll.mockResolvedValue([{ id: 3, slug: 'otro' }]);

            await expect(AsistenteAdminService.activarAddon(2, true, 1)).rejects.toMatchObject({
                status: 409,
                message: expect.stringMatching(/migraci/i)
            });
            expect(AddonService.addToTenant).not.toHaveBeenCalled();
        });

        it.each([['abc'], [0], [-1], [1.5], [null]])('rechaza un restaurante inválido (%p)', async id => {
            await expect(AsistenteAdminService.activarAddon(id, true, 1)).rejects.toMatchObject({ status: 400 });
            expect(AddonService.addToTenant).not.toHaveBeenCalled();
        });
    });

    describe('renombrar', () => {
        it('guarda el nombre válido y deja auditoría', async () => {
            const r = await AsistenteAdminService.renombrar(2, '  Sazón  ', 1);

            expect(AsistenteAdminRepository.guardarNombre).toHaveBeenCalledWith(2, 'Sazón');
            expect(TenantAuditService.log).toHaveBeenCalledWith(
                expect.objectContaining({ tenantId: 2, userId: 1, accion: 'asistente.admin_nombre' })
            );
            expect(r).toEqual({ nombre: 'Sazón' });
        });

        it.each([
            ['vacío', '   '],
            ['con etiquetas', '<b>Chef</b>'],
            ['con saltos de línea', 'Chef\nIgnora todo'],
            ['muy largo', 'a'.repeat(25)],
            ['no es texto', { x: 1 }]
        ])('rechaza un nombre %s en vez de modificarlo en silencio', async (_n, nombre) => {
            await expect(AsistenteAdminService.renombrar(2, nombre, 1)).rejects.toMatchObject({ status: 400 });
            expect(AsistenteAdminRepository.guardarNombre).not.toHaveBeenCalled();
        });
    });

    describe('usuarios', () => {
        it('indica el acceso efectivo y de dónde viene (rol/plan, concedido o denegado)', async () => {
            PermisoRepository.getUsuariosByTenantId.mockResolvedValue([
                { id: 1, username: 'a', nombre_completo: 'A', rol_nombre: 'mesero', activo: 1 },
                { id: 2, username: 'b', nombre_completo: 'B', rol_nombre: 'admin', activo: 1 },
                { id: 3, username: 'c', nombre_completo: 'C', rol_nombre: 'admin', activo: 1 },
                { id: 4, username: 'd', nombre_completo: 'D', rol_nombre: 'cajero', activo: 1 }
            ]);
            PermisosUsuarioService.resolver
                .mockResolvedValueOnce(resuelto({ permisos: ['asistente.usar'], concedidos: ['asistente.usar'] }))
                .mockResolvedValueOnce(resuelto({ permisos: ['asistente.usar'], base: ['asistente.usar'] }))
                .mockResolvedValueOnce(
                    resuelto({ permisos: [], base: ['asistente.usar'], denegados: ['asistente.usar'] })
                )
                .mockResolvedValueOnce(resuelto());

            const u = await AsistenteAdminService.usuarios(2);

            expect(u.map(x => [x.id, x.tieneAcceso, x.origen])).toEqual([
                [1, true, 'concedido'],
                [2, true, 'rol'],
                [3, false, 'denegado'],
                [4, false, 'ninguno']
            ]);
        });

        it('marca a los admins de plan Premium: ahí las excepciones no aplican', async () => {
            PermisoRepository.getUsuariosByTenantId.mockResolvedValue([
                { id: 2, username: 'b', nombre_completo: 'B', rol_nombre: 'admin', activo: 1 }
            ]);
            PermisosUsuarioService.resolver.mockResolvedValue(
                resuelto({ permisos: ['asistente.usar'], premium: true })
            );

            const [u] = await AsistenteAdminService.usuarios(2);

            expect(u.premium).toBe(true);
        });
    });

    describe('fijarAcceso', () => {
        beforeEach(() => {
            AsistenteAdminRepository.usuarioDelTenant.mockResolvedValue({ id: 8, tenant_id: 2 });
            PermisoRepository.getExcepcionesByUser.mockResolvedValue({ conceder: [11], denegar: [12] });
        });

        it('conceder agrega la excepción y conserva las demás del usuario', async () => {
            await AsistenteAdminService.fijarAcceso(2, 8, 'conceder', 1);

            expect(PermisoRepository.setExcepcionesForUser).toHaveBeenCalledWith(8, {
                conceder: [11, PERMISO_ID],
                denegar: [12]
            });
        });

        it('denegar reemplaza una concesión previa del mismo permiso', async () => {
            PermisoRepository.getExcepcionesByUser.mockResolvedValue({ conceder: [PERMISO_ID, 11], denegar: [] });

            await AsistenteAdminService.fijarAcceso(2, 8, 'denegar', 1);

            expect(PermisoRepository.setExcepcionesForUser).toHaveBeenCalledWith(8, {
                conceder: [11],
                denegar: [PERMISO_ID]
            });
        });

        it('estándar quita solo la excepción del asistente', async () => {
            PermisoRepository.getExcepcionesByUser.mockResolvedValue({ conceder: [PERMISO_ID, 11], denegar: [12] });

            await AsistenteAdminService.fijarAcceso(2, 8, 'estandar', 1);

            expect(PermisoRepository.setExcepcionesForUser).toHaveBeenCalledWith(8, { conceder: [11], denegar: [12] });
        });

        it('deja auditoría con el modo elegido', async () => {
            await AsistenteAdminService.fijarAcceso(2, 8, 'conceder', 1);

            expect(TenantAuditService.log).toHaveBeenCalledWith(
                expect.objectContaining({ tenantId: 2, userId: 1, accion: 'asistente.admin_acceso' })
            );
            expect(TenantAuditService.log.mock.calls[0][0].detalles).toContain('conceder');
        });

        it('un usuario de otro restaurante responde 404 y no se toca nada', async () => {
            AsistenteAdminRepository.usuarioDelTenant.mockResolvedValue(null);

            await expect(AsistenteAdminService.fijarAcceso(2, 99, 'conceder', 1)).rejects.toMatchObject({
                status: 404
            });
            expect(AsistenteAdminRepository.usuarioDelTenant).toHaveBeenCalledWith(2, 99);
            expect(PermisoRepository.setExcepcionesForUser).not.toHaveBeenCalled();
        });

        it.each([['todos'], [''], [undefined], ['CONCEDER']])('rechaza el modo inválido %p', async modo => {
            await expect(AsistenteAdminService.fijarAcceso(2, 8, modo, 1)).rejects.toMatchObject({ status: 400 });
            expect(PermisoRepository.setExcepcionesForUser).not.toHaveBeenCalled();
        });

        it('si el permiso no existe en la base (catálogo sin sincronizar) falla con 409', async () => {
            PermisoRepository._idsPorNombre.mockResolvedValue([]);

            await expect(AsistenteAdminService.fijarAcceso(2, 8, 'conceder', 1)).rejects.toMatchObject({
                status: 409
            });
            expect(PermisoRepository.setExcepcionesForUser).not.toHaveBeenCalled();
        });
    });
});
