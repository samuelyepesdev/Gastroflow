const crypto = require('crypto');
const { obtenerBaseUrl } = require('../../../utils/baseUrl');
const { escapeHtml } = require('../../../utils/escapeHtml');
const bloquearLogoutCrossSite = require('../../../middleware/bloquearLogoutCrossSite');

describe('obtenerBaseUrl (Host header injection)', () => {
    const env = { ...process.env };
    afterEach(() => {
        process.env = { ...env };
    });
    const req = (host, extra = {}) => ({ headers: { host, ...extra }, protocol: 'http' });

    test('APP_URL manda siempre, ignorando Host y X-Forwarded-Host', () => {
        process.env.APP_URL = 'https://app.miresto.co/';
        expect(obtenerBaseUrl(req('evil.com', { 'x-forwarded-host': 'evil.com' }))).toBe('https://app.miresto.co');
    });

    test('en producción sin APP_URL nunca se usa el Host de la petición', () => {
        delete process.env.APP_URL;
        process.env.NODE_ENV = 'production';
        expect(obtenerBaseUrl(req('evil.com'))).toBe('https://gastroflow.digital');
        expect(obtenerBaseUrl(req('evil.com'), { permitirHostDePeticion: false })).toBe('https://gastroflow.digital');
    });

    test('fuera de producción sin APP_URL usa el Host si tiene forma válida (dev/Electron)', () => {
        delete process.env.APP_URL;
        process.env.NODE_ENV = 'development';
        expect(obtenerBaseUrl(req('localhost:3000'))).toBe('http://localhost:3000');
        expect(obtenerBaseUrl(req('127.0.0.1:3000'))).toBe('http://127.0.0.1:3000');
    });

    test('un Host con caracteres peligrosos se descarta', () => {
        delete process.env.APP_URL;
        process.env.NODE_ENV = 'development';
        expect(obtenerBaseUrl(req('evil.com/<script>'))).toBe('https://gastroflow.digital');
        expect(obtenerBaseUrl(req('a b'))).toBe('https://gastroflow.digital');
    });

    test('APP_URL inválida (sin http/https) se ignora', () => {
        process.env.APP_URL = 'javascript:alert(1)';
        process.env.NODE_ENV = 'production';
        expect(obtenerBaseUrl(req('x.com'))).toBe('https://gastroflow.digital');
    });
});

describe('escapeHtml (correo de verificación)', () => {
    test('escapa & < > " \'', () => {
        expect(escapeHtml('<img src=x onerror="a()"> & \'q\'')).toBe(
            '&lt;img src=x onerror=&quot;a()&quot;&gt; &amp; &#39;q&#39;'
        );
    });
    test('null/undefined/números', () => {
        expect(escapeHtml(null)).toBe('');
        expect(escapeHtml(undefined)).toBe('');
        expect(escapeHtml(5)).toBe('5');
    });
});

describe('bloquearLogoutCrossSite', () => {
    const run = site => {
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        const next = jest.fn();
        bloquearLogoutCrossSite({ headers: site ? { 'sec-fetch-site': site } : {} }, res, next);
        return { res, next };
    };
    test('cross-site (p. ej. <img> en otra página) se rechaza con 403', () => {
        const { res, next } = run('cross-site');
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });
    test('same-origin, same-site, none (clic directo/URL escrita) y sin cabecera pasan', () => {
        ['same-origin', 'same-site', 'none', null].forEach(s => expect(run(s).next).toHaveBeenCalled());
    });
});

describe('WompiService.verificarFirmaWebhook (comparación de tiempo constante)', () => {
    const WompiService = require('../../../services/Shared/WompiService');
    const SECRETO = 'secreto-de-prueba';
    const payload = () => {
        const data = { transaction: { id: 'T1', status: 'APPROVED', amount_in_cents: 1000 } };
        const timestamp = 1700000000;
        const properties = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];
        const checksum = crypto.createHash('sha256').update(`T1APPROVED1000${timestamp}${SECRETO}`).digest('hex');
        return { data, timestamp, signature: { properties, checksum } };
    };
    beforeEach(() => {
        process.env.WOMPI_EVENTS_SECRET = SECRETO;
    });

    test('firma válida pasa (incluso con timestamp antiguo: Wompi reintenta con el original)', () => {
        expect(WompiService.verificarFirmaWebhook(payload())).toBe(true);
    });
    test('checksum alterado, de otra longitud o no string se rechaza sin lanzar', () => {
        const p = payload();
        p.signature.checksum = p.signature.checksum.replace(/.$/, c => (c === 'a' ? 'b' : 'a'));
        expect(WompiService.verificarFirmaWebhook(p)).toBe(false);
        const corto = payload();
        corto.signature.checksum = 'abc';
        expect(WompiService.verificarFirmaWebhook(corto)).toBe(false);
        const raro = payload();
        raro.signature.checksum = 12345;
        expect(WompiService.verificarFirmaWebhook(raro)).toBe(false);
    });
    test('datos alterados invalidan la firma', () => {
        const p = payload();
        p.data.transaction.status = 'DECLINED';
        expect(WompiService.verificarFirmaWebhook(p)).toBe(false);
    });
});
