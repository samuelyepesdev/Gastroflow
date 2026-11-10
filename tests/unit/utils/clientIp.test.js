const { getClientIp } = require('../../../utils/clientIp');

const req = (headers = {}, ip = '203.0.113.9') => ({ headers, ip });

describe('getClientIp', () => {
    const original = process.env.CF_ORIGIN_SECRET;
    afterEach(() => {
        if (original === undefined) {
            delete process.env.CF_ORIGIN_SECRET;
        } else {
            process.env.CF_ORIGIN_SECRET = original;
        }
    });

    describe('sin CF_ORIGIN_SECRET (comportamiento anterior)', () => {
        beforeEach(() => delete process.env.CF_ORIGIN_SECRET);

        it('usa cf-connecting-ip si es una IP válida', () => {
            expect(getClientIp(req({ 'cf-connecting-ip': '198.51.100.7' }))).toBe('198.51.100.7');
        });

        it('ignora un cf-connecting-ip que no es una IP', () => {
            expect(getClientIp(req({ 'cf-connecting-ip': 'basura' }))).toBe('203.0.113.9');
        });

        it('sin cabecera usa req.ip', () => {
            expect(getClientIp(req())).toBe('203.0.113.9');
        });
    });

    describe('con CF_ORIGIN_SECRET', () => {
        beforeEach(() => {
            process.env.CF_ORIGIN_SECRET = 'secreto-largo-de-prueba';
        });

        it('acepta cf-connecting-ip cuando el secreto coincide', () => {
            const r = req({ 'cf-connecting-ip': '198.51.100.7', 'x-origin-secret': 'secreto-largo-de-prueba' });
            expect(getClientIp(r)).toBe('198.51.100.7');
        });

        it('ignora cf-connecting-ip sin el secreto (acceso directo)', () => {
            expect(getClientIp(req({ 'cf-connecting-ip': '198.51.100.7' }))).toBe('203.0.113.9');
        });

        it('ignora cf-connecting-ip con un secreto incorrecto', () => {
            const r = req({ 'cf-connecting-ip': '198.51.100.7', 'x-origin-secret': 'otro' });
            expect(getClientIp(r)).toBe('203.0.113.9');
        });

        it('rotar la cabecera no cambia la IP de un cliente directo', () => {
            const a = getClientIp(req({ 'cf-connecting-ip': '198.51.100.1' }));
            const b = getClientIp(req({ 'cf-connecting-ip': '198.51.100.2' }));
            expect(a).toBe(b);
        });
    });
});
