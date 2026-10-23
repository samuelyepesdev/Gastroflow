/**
 * Un cambio de plan ya no reescribe permisos: solo quita las excepciones de los admins del
 * restaurante y refresca su caché. Los demás usuarios no se tocan.
 */
jest.mock('../../../repositories/Admin/PermisoRepository', () => ({
    getUsuariosByTenantId: jest.fn(),
    reiniciarExcepciones: jest.fn()
}));
jest.mock('../../../services/Shared/CacheService', () => ({ delete: jest.fn() }));

const PermisoRepository = require('../../../repositories/Admin/PermisoRepository');
const CacheService = require('../../../services/Shared/CacheService');
const {
    syncPlanPermissionsToTenantUsers,
    getPermissionNamesForPlan
} = require('../../../services/Admin/PlanPermissionSyncService');

beforeEach(() => jest.resetAllMocks());

test('solo reinicia a los admins y limpia el caché de todo el restaurante', async () => {
    PermisoRepository.getUsuariosByTenantId.mockResolvedValue([
        { id: 1, rol_nombre: 'admin' },
        { id: 2, rol_nombre: 'cajero' },
        { id: 3, rol_nombre: 'Admin' }
    ]);
    PermisoRepository.reiniciarExcepciones.mockResolvedValue(4);
    const r = await syncPlanPermissionsToTenantUsers(9);
    expect(PermisoRepository.reiniciarExcepciones).toHaveBeenCalledWith([1, 3]);
    expect(r).toEqual({ admins: 2, excepcionesQuitadas: 4 });
    expect(CacheService.delete).toHaveBeenCalledTimes(3);
    expect(CacheService.delete).toHaveBeenCalledWith('user:ctx:2');
});

test('un restaurante sin admins no falla', async () => {
    PermisoRepository.getUsuariosByTenantId.mockResolvedValue([]);
    PermisoRepository.reiniciarExcepciones.mockResolvedValue(0);
    expect(await syncPlanPermissionsToTenantUsers(9)).toEqual({ admins: 0, excepcionesQuitadas: 0 });
});

test('getPermissionNamesForPlan: Premium trae todo, un plan trae los permisos de sus módulos', () => {
    expect(getPermissionNamesForPlan({ slug: 'premium' }).length).toBeGreaterThan(50);
    const basico = getPermissionNamesForPlan({ slug: 'basico', caracteristicas: ['clientes'] });
    expect(basico).toEqual(expect.arrayContaining(['clientes.ver', 'clientes.crear']));
    expect(basico).not.toContain('productos.ver');
    expect(getPermissionNamesForPlan(null)).toEqual([]);
});
