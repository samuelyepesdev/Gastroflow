const cache = require('../../../services/Shared/CacheService');

describe('CacheService.remember', () => {
    beforeEach(() => cache.clear());

    it('runs the producer once for concurrent callers (no stampede)', async () => {
        const producer = jest.fn(async () => {
            await new Promise(r => setTimeout(r, 20));
            return { ok: true };
        });
        const results = await Promise.all(Array.from({ length: 10 }, () => cache.remember('k', 60, producer)));
        expect(producer).toHaveBeenCalledTimes(1);
        results.forEach(r => expect(r).toEqual({ ok: true }));
    });

    it('serves from cache afterwards', async () => {
        const producer = jest.fn(async () => 42);
        await cache.remember('k2', 60, producer);
        await cache.remember('k2', 60, producer);
        expect(producer).toHaveBeenCalledTimes(1);
    });

    it('does not cache failures and lets the next call retry', async () => {
        const producer = jest.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('ok');
        await expect(cache.remember('k3', 60, producer)).rejects.toThrow('boom');
        await expect(cache.remember('k3', 60, producer)).resolves.toBe('ok');
        expect(producer).toHaveBeenCalledTimes(2);
    });
});
