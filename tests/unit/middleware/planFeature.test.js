/**
 * Tests unitarios para middleware/planFeature.js
 */

jest.mock('../../../utils/planPermissions', () => ({
    planHasModule: jest.fn(),
    getPermissionNamesForModule: jest.fn()
}));
jest.mock('../../../services/Shared/AuthService', () => ({
    hasPermission: jest.fn()
}));

const planPermissions = require('../../../utils/planPermissions');
const authService = require('../../../services/Shared/AuthService');
const { requirePlanFeature } = require('../../../middleware/planFeature');

const createReq = (overrides = {}) => ({
    user: null,
    tenant: null,
    xhr: false,
    headers: { accept: '' },
    ...overrides
});

const createRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.render = jest.fn().mockReturnValue(res);
    return res;
};

describe('middleware/planFeature', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('requirePlanFeature', () => {
        it('pasa si el usuario es superadmin', () => {
            const middleware = requirePlanFeature('costeo');
            const req = createReq({ user: { rol: 'superadmin' } });
            const res = createRes();
            const next = jest.fn();
            middleware(req, res, next);
            expect(next).toHaveBeenCalled();
            expect(planPermissions.planHasModule).not.toHaveBeenCalled();
        });

        it('devuelve 403 JSON si no hay tenant (XHR)', () => {
            const middleware = requirePlanFeature('costeo');
            const req = createReq({ user: { rol: 'admin' }, tenant: null, xhr: true });
            const res = createRes();
            const next = jest.fn();
            middleware(req, res, next);
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({
                error: 'Tu plan no incluye esta función. Contacta al administrador para actualizar.'
            });
            expect(next).not.toHaveBeenCalled();
        });

        it('devuelve 403 render si no hay tenant (no XHR)', () => {
            const middleware = requirePlanFeature('costeo');
            const req = createReq({ user: { rol: 'admin' }, tenant: null });
            const res = createRes();
            const next = jest.fn();
            middleware(req, res, next);
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.render).toHaveBeenCalled();
            expect(next).not.toHaveBeenCalled();
        });

        it('pasa si el plan incluye el módulo', () => {
            planPermissions.planHasModule.mockReturnValue(true);
            const middleware = requirePlanFeature('costeo');
            const req = createReq({ user: { rol: 'admin' }, tenant: { plan: { caracteristicas: ['costeo'] } } });
            const res = createRes();
            const next = jest.fn();
            middleware(req, res, next);
            expect(planPermissions.planHasModule).toHaveBeenCalledWith({ caracteristicas: ['costeo'] }, 'costeo', []);
            expect(next).toHaveBeenCalled();
            expect(authService.hasPermission).not.toHaveBeenCalled();
        });

        it('pasa el addonSlugs del tenant a planHasModule (BUG REGRESIÓN: antes un add-on pago nunca desbloqueaba nada)', () => {
            planPermissions.planHasModule.mockReturnValue(true);
            const middleware = requirePlanFeature('costeo');
            const req = createReq({
                user: { rol: 'admin' },
                tenant: { plan: { caracteristicas: ['productos'] }, addonSlugs: ['costeo'] }
            });
            const res = createRes();
            const next = jest.fn();
            middleware(req, res, next);
            expect(planPermissions.planHasModule).toHaveBeenCalledWith({ caracteristicas: ['productos'] }, 'costeo', [
                'costeo'
            ]);
            expect(next).toHaveBeenCalled();
        });

        it('pasa si el usuario tiene permiso que desbloquea el módulo', () => {
            planPermissions.planHasModule.mockReturnValue(false);
            planPermissions.getPermissionNamesForModule.mockReturnValue(['costeo.ver', 'costeo.editar']);
            authService.hasPermission.mockReturnValue(true);
            const middleware = requirePlanFeature('costeo');
            const req = createReq({
                user: { rol: 'admin', permisos: ['costeo.ver'] },
                tenant: { plan: { caracteristicas: ['productos'] } }
            });
            const res = createRes();
            const next = jest.fn();
            middleware(req, res, next);
            expect(planPermissions.getPermissionNamesForModule).toHaveBeenCalledWith('costeo');
            expect(authService.hasPermission).toHaveBeenCalled();
            expect(next).toHaveBeenCalled();
        });

        it('devuelve 403 JSON si el plan no incluye y no tiene permiso (Accept json)', () => {
            planPermissions.planHasModule.mockReturnValue(false);
            planPermissions.getPermissionNamesForModule.mockReturnValue(['costeo.ver']);
            authService.hasPermission.mockReturnValue(false);
            const middleware = requirePlanFeature('costeo');
            const req = createReq({
                user: { rol: 'admin', permisos: [] },
                tenant: { plan: { caracteristicas: ['productos'] } },
                headers: { accept: 'application/json' }
            });
            const res = createRes();
            const next = jest.fn();
            middleware(req, res, next);
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({
                error: 'Tu plan no incluye esta función. Contacta al administrador para actualizar.'
            });
            expect(next).not.toHaveBeenCalled();
        });
    });
});
