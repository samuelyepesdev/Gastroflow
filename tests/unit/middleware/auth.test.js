/**
 * Tests unitarios para middleware/auth.js
 */

jest.mock('../../../services/Shared/AuthService', () => ({
    verifyToken: jest.fn(),
    hasRole: jest.fn(),
    hasPermission: jest.fn()
}));

const authService = require('../../../services/Shared/AuthService');
const {
    requireAuth,
    requireRole,
    requirePermission,
    restrictSuperadminToAdmin,
    optionalAuth
} = require('../../../middleware/auth');

const createReq = (overrides = {}) => ({
    headers: {},
    cookies: {},
    query: {},
    xhr: false,
    baseUrl: '',
    path: '',
    ...overrides
});

const createRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.redirect = jest.fn().mockReturnValue(res);
    res.render = jest.fn().mockReturnValue(res);
    return res;
};

describe('middleware/auth', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('requireAuth', () => {
        it('devuelve 401 JSON si no hay token (XHR)', () => {
            const req = createReq({ xhr: true });
            const res = createRes();
            const next = jest.fn();
            requireAuth(req, res, next);
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({ error: 'No autorizado. Token requerido' });
            expect(next).not.toHaveBeenCalled();
        });
        it('redirige a /auth/login si no hay token (no XHR)', () => {
            const req = createReq();
            const res = createRes();
            const next = jest.fn();
            requireAuth(req, res, next);
            expect(res.redirect).toHaveBeenCalledWith('/auth/login');
            expect(next).not.toHaveBeenCalled();
        });
        it('toma token de Authorization Bearer', () => {
            authService.verifyToken.mockReturnValue({ id: 1, username: 'u' });
            const req = createReq({ headers: { authorization: 'Bearer abc123' } });
            const res = createRes();
            const next = jest.fn();
            requireAuth(req, res, next);
            expect(authService.verifyToken).toHaveBeenCalledWith('abc123');
            expect(req.user).toEqual({ id: 1, username: 'u' });
            expect(next).toHaveBeenCalled();
        });
        it('toma token de cookie auth_token si no hay header', () => {
            authService.verifyToken.mockReturnValue({ id: 2 });
            const req = createReq({ cookies: { auth_token: 'cookie-token' } });
            const res = createRes();
            const next = jest.fn();
            requireAuth(req, res, next);
            expect(authService.verifyToken).toHaveBeenCalledWith('cookie-token');
            expect(next).toHaveBeenCalled();
        });
        it('toma token de query.token si no hay header ni cookie', () => {
            authService.verifyToken.mockReturnValue({ id: 3 });
            const req = createReq({ query: { token: 'query-token' } });
            const res = createRes();
            const next = jest.fn();
            requireAuth(req, res, next);
            expect(authService.verifyToken).toHaveBeenCalledWith('query-token');
            expect(next).toHaveBeenCalled();
        });
        it('devuelve 401 JSON si token inválido (Accept json)', () => {
            authService.verifyToken.mockReturnValue(null);
            const req = createReq({
                headers: { authorization: 'Bearer bad', accept: 'application/json' },
                xhr: false
            });
            const res = createRes();
            const next = jest.fn();
            requireAuth(req, res, next);
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({ error: 'Token inválido o expirado' });
            expect(next).not.toHaveBeenCalled();
        });
        it('redirige a login si token inválido (no JSON)', () => {
            authService.verifyToken.mockReturnValue(null);
            const req = createReq({ cookies: { auth_token: 'bad' } });
            const res = createRes();
            const next = jest.fn();
            requireAuth(req, res, next);
            expect(res.redirect).toHaveBeenCalledWith('/auth/login');
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('requireRole', () => {
        it('devuelve 401 si no hay req.user', () => {
            const req = createReq();
            const res = createRes();
            const next = jest.fn();
            requireRole('admin')(req, res, next);
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({ error: 'No autenticado' });
            expect(next).not.toHaveBeenCalled();
        });
        it('llama next si el usuario tiene uno de los roles permitidos', () => {
            authService.hasRole.mockReturnValue(true);
            const req = createReq({ user: { rol: 'admin' } });
            const res = createRes();
            const next = jest.fn();
            requireRole('admin', 'vendedor')(req, res, next);
            expect(authService.hasRole).toHaveBeenCalledWith('admin', ['admin', 'vendedor']);
            expect(next).toHaveBeenCalled();
        });
        it('devuelve 403 JSON si el rol no está permitido (XHR)', () => {
            authService.hasRole.mockReturnValue(false);
            const req = createReq({ user: { rol: 'otro' }, xhr: true });
            const res = createRes();
            const next = jest.fn();
            requireRole('admin')(req, res, next);
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({ error: 'No tiene permisos para acceder a este recurso' });
            expect(next).not.toHaveBeenCalled();
        });
        it('renderiza errors/generic si el rol no está permitido (no XHR)', () => {
            authService.hasRole.mockReturnValue(false);
            const req = createReq({ user: { rol: 'otro' }, headers: { accept: 'text/html' } });
            const res = createRes();
            const next = jest.fn();
            requireRole('admin')(req, res, next);
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.render).toHaveBeenCalledWith(
                'errors/generic',
                expect.objectContaining({ error: expect.any(Object) })
            );
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('requirePermission', () => {
        it('devuelve 401 si no hay req.user', () => {
            const req = createReq();
            const res = createRes();
            const next = jest.fn();
            requirePermission('productos.ver')(req, res, next);
            expect(res.status).toHaveBeenCalledWith(401);
            expect(next).not.toHaveBeenCalled();
        });
        it('llama next si el usuario tiene el permiso', () => {
            authService.hasPermission.mockReturnValue(true);
            const req = createReq({ user: { permisos: ['productos.ver'] } });
            const res = createRes();
            const next = jest.fn();
            requirePermission('productos.ver')(req, res, next);
            expect(authService.hasPermission).toHaveBeenCalledWith(['productos.ver'], 'productos.ver');
            expect(next).toHaveBeenCalled();
        });
        it('devuelve 403 JSON si no tiene permiso (Accept json)', () => {
            authService.hasPermission.mockReturnValue(false);
            const req = createReq({ user: { permisos: [] }, headers: { accept: 'application/json' } });
            const res = createRes();
            const next = jest.fn();
            requirePermission('productos.editar')(req, res, next);
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({ error: 'No tiene permisos para realizar esta acción' });
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('restrictSuperadminToAdmin', () => {
        it('llama next si el usuario no es superadmin', () => {
            const req = createReq({ user: { rol: 'admin' }, baseUrl: '/admin', path: '/ventas' });
            const res = createRes();
            const next = jest.fn();
            restrictSuperadminToAdmin(req, res, next);
            expect(next).toHaveBeenCalled();
            expect(res.redirect).not.toHaveBeenCalled();
        });
        it('permite a superadmin /admin/tenants', () => {
            const req = createReq({ user: { rol: 'superadmin' }, baseUrl: '/admin', path: '/tenants' });
            const res = createRes();
            const next = jest.fn();
            restrictSuperadminToAdmin(req, res, next);
            expect(next).toHaveBeenCalled();
        });
        it('permite a superadmin /costeo', () => {
            const req = createReq({ user: { rol: 'superadmin' }, baseUrl: '/costeo', path: '/' });
            const res = createRes();
            const next = jest.fn();
            restrictSuperadminToAdmin(req, res, next);
            expect(next).toHaveBeenCalled();
        });
        it('permite a superadmin /auth/logout', () => {
            const req = createReq({ user: { rol: 'superadmin' }, baseUrl: '/auth', path: '/logout' });
            const res = createRes();
            const next = jest.fn();
            restrictSuperadminToAdmin(req, res, next);
            expect(next).toHaveBeenCalled();
        });
        it('redirige a /admin/dashboard si superadmin intenta ruta no permitida (no XHR)', () => {
            const req = createReq({ user: { rol: 'superadmin' }, baseUrl: '', path: '/dashboard' });
            const res = createRes();
            const next = jest.fn();
            restrictSuperadminToAdmin(req, res, next);
            expect(res.redirect).toHaveBeenCalledWith('/admin/dashboard');
            expect(next).not.toHaveBeenCalled();
        });
        it('devuelve 403 JSON si superadmin intenta ruta no permitida (XHR)', () => {
            const req = createReq({ user: { rol: 'superadmin' }, baseUrl: '', path: '/mesas', xhr: true });
            const res = createRes();
            const next = jest.fn();
            restrictSuperadminToAdmin(req, res, next);
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({
                error: 'Acceso restringido. Solo gestión de restaurantes, landing page y costeo.'
            });
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('optionalAuth', () => {
        it('llama next sin req.user si no hay token', () => {
            const req = createReq();
            const res = createRes();
            const next = jest.fn();
            optionalAuth(req, res, next);
            expect(req.user).toBeUndefined();
            expect(next).toHaveBeenCalled();
        });
        it('asigna req.user si hay token Bearer válido', () => {
            authService.verifyToken.mockReturnValue({ id: 1, username: 'u' });
            const req = createReq({ headers: { authorization: 'Bearer valid' } });
            const res = createRes();
            const next = jest.fn();
            optionalAuth(req, res, next);
            expect(req.user).toEqual({ id: 1, username: 'u' });
            expect(next).toHaveBeenCalled();
        });
        it('no asigna req.user si token es inválido', () => {
            authService.verifyToken.mockReturnValue(null);
            const req = createReq({ cookies: { auth_token: 'invalid' } });
            const res = createRes();
            const next = jest.fn();
            optionalAuth(req, res, next);
            expect(req.user).toBeUndefined();
            expect(next).toHaveBeenCalled();
        });
    });
});
