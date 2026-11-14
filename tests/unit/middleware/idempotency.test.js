const idempotency = require('../../../middleware/idempotency');
const cacheService = require('../../../services/Shared/CacheService');

function crearReq({ method = 'POST', url = '/api/facturas', token, key = 'k1', cookies } = {}) {
    const headers = { 'idempotency-key': key };
    if (token) {
        headers.authorization = `Bearer ${token}`;
    }
    return { method, originalUrl: url, path: url, headers, cookies: cookies || {}, ip: '1.1.1.1' };
}

function crearRes() {
    const res = { statusCode: 200, headers: {} };
    res.status = jest.fn(c => {
        res.statusCode = c;
        return res;
    });
    res.setHeader = jest.fn();
    res.getHeader = jest.fn();
    res.json = jest.fn(() => res);
    res.send = jest.fn(() => res);
    return res;
}

function ejecutar(req) {
    const res = crearRes();
    const next = jest.fn();
    idempotency(req, res, next);
    return { res, next };
}

describe('idempotency middleware', () => {
    beforeEach(() => {
        cacheService.cache.clear();
    });

    it('repite la respuesta para la misma identidad, método y ruta', () => {
        const a = ejecutar(crearReq({ token: 'tokA' }));
        a.res.json({ ok: 1 });
        const b = ejecutar(crearReq({ token: 'tokA' }));
        expect(b.next).not.toHaveBeenCalled();
        expect(b.res.json).toHaveBeenCalledWith({ ok: 1 });
    });

    it('no reutiliza la respuesta entre usuarios distintos con la misma llave', () => {
        const a = ejecutar(crearReq({ token: 'tokA' }));
        a.res.json({ secreto: 'tenantA' });
        const b = ejecutar(crearReq({ token: 'tokB' }));
        expect(b.next).toHaveBeenCalled();
    });

    it('no reutiliza la respuesta de una petición autenticada para una anónima', () => {
        const a = ejecutar(crearReq({ token: 'tokA' }));
        a.res.json({ secreto: 1 });
        const b = ejecutar(crearReq());
        expect(b.next).toHaveBeenCalled();
    });

    it('no reutiliza la respuesta entre rutas distintas', () => {
        const a = ejecutar(crearReq({ token: 'tokA', url: '/api/facturas' }));
        a.res.json({ ok: 1 });
        const b = ejecutar(crearReq({ token: 'tokA', url: '/api/pedidos' }));
        expect(b.next).toHaveBeenCalled();
    });

    it('ignora /auth/* y webhooks (nunca cachea ni intercepta)', () => {
        const a = ejecutar(crearReq({ url: '/auth/login' }));
        expect(a.next).toHaveBeenCalled();
        a.res.json({ token: 'x' });
        const b = ejecutar(crearReq({ url: '/auth/login' }));
        expect(b.next).toHaveBeenCalled();
        const w = ejecutar(crearReq({ url: '/webhooks/wompi' }));
        expect(w.next).toHaveBeenCalled();
    });
});
