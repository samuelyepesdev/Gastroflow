/**
 * Tests unitarios para middleware/tenant.js (mock de TenantRepository)
 */

jest.mock('../../../repositories/Admin/TenantRepository', () => ({
    getDefault: jest.fn(),
    findById: jest.fn()
}));
jest.mock('../../../repositories/Admin/AddonRepository', () => ({
    getByTenant: jest.fn().mockResolvedValue([])
}));

const TenantRepository = require('../../../repositories/Admin/TenantRepository');
const AddonRepository = require('../../../repositories/Admin/AddonRepository');
const { attachTenantContext, costeoTenantContext } = require('../../../middleware/tenant');

const createReq = (overrides = {}) => ({
    user: null,
    headers: {},
    xhr: false,
    query: {},
    baseUrl: '',
    path: '',
    ...overrides
});

const createRes = () => {
    const res = { locals: {} };
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.redirect = jest.fn().mockReturnValue(res);
    res.render = jest.fn().mockReturnValue(res);
    res.clearCookie = jest.fn();
    return res;
};

describe('middleware/tenant', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('attachTenantContext', () => {
        it('devuelve 401 si no hay req.user', async () => {
            const req = createReq();
            const res = createRes();
            const next = jest.fn();
            await attachTenantContext(req, res, next);
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({ error: 'No autenticado' });
            expect(next).not.toHaveBeenCalled();
        });

        it('usa tenant_id del usuario y adjunta req.tenant', async () => {
            const tenant = { id: 1, nombre: 'Tenant A', activo: true, plan: { caracteristicas: [] } };
            TenantRepository.findById.mockResolvedValue(tenant);
            const req = createReq({ user: { tenant_id: 1 } });
            const res = createRes();
            const next = jest.fn();
            await attachTenantContext(req, res, next);
            expect(TenantRepository.findById).toHaveBeenCalledWith(1);
            expect(req.tenant).toEqual(tenant);
            expect(res.locals.tenant).toEqual(tenant);
            expect(res.locals.allowedByPlan).toBeDefined();
            expect(next).toHaveBeenCalled();
        });

        it('usa getDefault si user no tiene tenant_id', async () => {
            const defaultTenant = { id: 99, nombre: 'Principal', activo: true, plan: null };
            TenantRepository.getDefault.mockResolvedValue(defaultTenant);
            TenantRepository.findById.mockResolvedValue(defaultTenant);
            const req = createReq({ user: {} });
            const res = createRes();
            const next = jest.fn();
            await attachTenantContext(req, res, next);
            expect(TenantRepository.getDefault).toHaveBeenCalled();
            expect(req.user.tenant_id).toBe(99);
            expect(req.tenant).toEqual(defaultTenant);
            expect(next).toHaveBeenCalled();
        });

        it('devuelve 403 JSON si no hay default tenant y user sin tenant_id', async () => {
            TenantRepository.getDefault.mockResolvedValue(null);
            const req = createReq({ user: {}, xhr: true });
            const res = createRes();
            const next = jest.fn();
            await attachTenantContext(req, res, next);
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({ error: 'No hay tenant configurado' });
            expect(next).not.toHaveBeenCalled();
        });

        it('redirige a /auth/login si tenant no encontrado (no XHR)', async () => {
            TenantRepository.findById.mockResolvedValue(null);
            const req = createReq({ user: { tenant_id: 999 } });
            const res = createRes();
            const next = jest.fn();
            await attachTenantContext(req, res, next);
            expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('/auth/login'));
            expect(next).not.toHaveBeenCalled();
        });

        it('devuelve 403 JSON si tenant no encontrado (XHR)', async () => {
            TenantRepository.findById.mockResolvedValue(null);
            const req = createReq({ user: { tenant_id: 999 }, xhr: true });
            const res = createRes();
            const next = jest.fn();
            await attachTenantContext(req, res, next);
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({ error: 'Tenant no encontrado' });
            expect(next).not.toHaveBeenCalled();
        });

        it('devuelve 403 si tenant no está activo (XHR)', async () => {
            const tenant = { id: 1, nombre: 'Inactivo', activo: false };
            TenantRepository.findById.mockResolvedValue(tenant);
            const req = createReq({ user: { tenant_id: 1 }, xhr: true });
            const res = createRes();
            const next = jest.fn();
            await attachTenantContext(req, res, next);
            expect(res.clearCookie).toHaveBeenCalledWith('auth_token');
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ error: expect.stringContaining('desactivado') })
            );
            expect(next).not.toHaveBeenCalled();
        });

        it('BUG REGRESIÓN: adjunta addonSlugs al tenant y desbloquea el módulo en allowedByPlan', async () => {
            const tenant = { id: 1, nombre: 'Tenant A', activo: true, plan: { caracteristicas: ['productos'] } };
            TenantRepository.findById.mockResolvedValue(tenant);
            AddonRepository.getByTenant.mockResolvedValueOnce([{ slug: 'costeo' }]);
            const req = createReq({ user: { tenant_id: 1, permisos: [] } });
            const res = createRes();
            const next = jest.fn();
            await attachTenantContext(req, res, next);
            expect(req.tenant.addonSlugs).toEqual(['costeo']);
            expect(res.locals.allowedByPlan.costeo).toBe(true);
            expect(next).toHaveBeenCalled();
        });

        it('si falla la carga de add-ons, no tumba el request (addonSlugs vacío)', async () => {
            const tenant = { id: 1, nombre: 'Tenant A', activo: true, plan: { caracteristicas: [] } };
            TenantRepository.findById.mockResolvedValue(tenant);
            AddonRepository.getByTenant.mockRejectedValueOnce(new Error('DB caída'));
            const req = createReq({ user: { tenant_id: 1 } });
            const res = createRes();
            const next = jest.fn();
            await attachTenantContext(req, res, next);
            expect(req.tenant.addonSlugs).toEqual([]);
            expect(next).toHaveBeenCalled();
        });

        it('devuelve 500 JSON en caso de error (XHR)', async () => {
            TenantRepository.findById.mockRejectedValue(new Error('DB error'));
            const req = createReq({ user: { tenant_id: 1 }, xhr: true });
            const res = createRes();
            const next = jest.fn();
            await attachTenantContext(req, res, next);
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ error: 'Error al cargar contexto del tenant' });
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('costeoTenantContext', () => {
        it('si es superadmin con query.tenant_id, asigna req.tenant', async () => {
            const tenant = { id: 5, nombre: 'T5', activo: true, plan: null };
            TenantRepository.findById.mockResolvedValue(tenant);
            const req = createReq({ user: { rol: 'superadmin' }, query: { tenant_id: '5' } });
            const res = createRes();
            const next = jest.fn();
            await costeoTenantContext(req, res, next);
            expect(TenantRepository.findById).toHaveBeenCalledWith(5);
            expect(req.tenant).toEqual(tenant);
            expect(res.locals.tenant).toEqual(tenant);
            expect(next).toHaveBeenCalled();
        });

        it('si es superadmin sin tenant_id, req.tenant null y next', async () => {
            const req = createReq({ user: { rol: 'superadmin' }, query: {} });
            const res = createRes();
            const next = jest.fn();
            await costeoTenantContext(req, res, next);
            expect(req.tenant).toBeNull();
            expect(res.locals.allowedByPlan).toBeDefined();
            expect(next).toHaveBeenCalled();
        });

        it('si no es superadmin delega en attachTenantContext', async () => {
            const tenant = { id: 1, nombre: 'T1', activo: true, plan: null };
            TenantRepository.findById.mockResolvedValue(tenant);
            const req = createReq({ user: { rol: 'admin', tenant_id: 1 } });
            const res = createRes();
            const next = jest.fn();
            await costeoTenantContext(req, res, next);
            expect(req.tenant).toEqual(tenant);
            expect(next).toHaveBeenCalled();
        });
    });
});
