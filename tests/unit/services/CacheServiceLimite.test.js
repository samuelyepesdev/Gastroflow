const { CacheService } = require('../../../services/Shared/CacheService');

describe('CacheService: tope de entradas y limpieza', () => {
    let cache;
    beforeEach(() => {
        jest.useFakeTimers();
        cache = new CacheService({ maxEntradas: 3, intervaloBarridoMs: 0 });
    });
    afterEach(() => jest.useRealTimers());

    test('nunca supera el tope: desaloja la entrada usada hace más tiempo', () => {
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3);
        cache.set('d', 4);
        expect(cache.size).toBe(3);
        expect(cache.get('a')).toBeNull();
        expect(cache.get('d')).toBe(4);
    });

    test('LRU: leer una clave la salva del desalojo', () => {
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3);
        expect(cache.get('a')).toBe(1); // 'a' pasa a ser la más reciente; 'b' la menos
        cache.set('d', 4);
        expect(cache.get('b')).toBeNull();
        expect(cache.get('a')).toBe(1);
    });

    test('reescribir una clave existente no consume una entrada nueva ni desaloja a otra', () => {
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3);
        cache.set('a', 10);
        expect(cache.size).toBe(3);
        expect(cache.get('b')).toBe(2);
        expect(cache.get('a')).toBe(10);
    });

    test('con el tope alcanzado se descartan primero las vencidas, no las vigentes', () => {
        cache.set('vence', 1, 1);
        cache.set('b', 2, 600);
        cache.set('c', 3, 600);
        jest.setSystemTime(Date.now() + 5000);
        cache.set('d', 4, 600);
        expect(cache.get('b')).toBe(2);
        expect(cache.get('c')).toBe(3);
        expect(cache.get('d')).toBe(4);
        expect(cache.get('vence')).toBeNull();
    });

    test('barrerExpiradas elimina las vencidas aunque nadie las vuelva a leer', () => {
        cache.set('x', 1, 1);
        cache.set('y', 2, 600);
        jest.setSystemTime(Date.now() + 5000);
        expect(cache.barrerExpiradas()).toBe(1);
        expect(cache.size).toBe(1);
    });

    test('el barrido periódico corre solo y no retiene el proceso (unref)', () => {
        const c = new CacheService({ maxEntradas: 10, intervaloBarridoMs: 1000 });
        c.set('x', 1, 1);
        jest.advanceTimersByTime(2500);
        expect(c.size).toBe(0);
        clearInterval(c._barrido);
    });

    test('maxEntradas por defecto de 5000 y CACHE_MAX_ENTRIES lo sobrescribe', () => {
        expect(new CacheService({ intervaloBarridoMs: 0 }).maxEntradas).toBe(5000);
        process.env.CACHE_MAX_ENTRIES = '42';
        expect(new CacheService({ intervaloBarridoMs: 0 }).maxEntradas).toBe(42);
        delete process.env.CACHE_MAX_ENTRIES;
    });

    test('remember y deleteByPrefix siguen funcionando con el tope', async () => {
        await cache.remember('p:1', 60, async () => 'uno');
        await cache.remember('p:2', 60, async () => 'dos');
        cache.deleteByPrefix('p:');
        expect(cache.size).toBe(0);
    });
});
