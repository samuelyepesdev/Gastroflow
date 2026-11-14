const { keyPorIp } = require('../../../utils/rateLimitKey');

describe('keyPorIp', () => {
    const original = process.env.CF_ORIGIN_SECRET;
    afterEach(() => {
        if (original === undefined) {
            delete process.env.CF_ORIGIN_SECRET;
        } else {
            process.env.CF_ORIGIN_SECRET = original;
        }
    });

    test('usa la IP real de CF-Connecting-IP, no la del nodo de borde (req.ip)', () => {
        delete process.env.CF_ORIGIN_SECRET;
        const a = keyPorIp({ headers: { 'cf-connecting-ip': '203.0.113.7' }, ip: '172.70.0.1' });
        const b = keyPorIp({ headers: { 'cf-connecting-ip': '203.0.113.8' }, ip: '172.70.0.1' });
        expect(a).toBe('203.0.113.7');
        expect(b).toBe('203.0.113.8');
    });

    test('con CF_ORIGIN_SECRET, una cabecera sin secreto se ignora y se usa req.ip', () => {
        process.env.CF_ORIGIN_SECRET = 'secreto-largo-de-prueba';
        expect(keyPorIp({ headers: { 'cf-connecting-ip': '203.0.113.7' }, ip: '172.70.0.1' })).toBe('172.70.0.1');
    });
});
