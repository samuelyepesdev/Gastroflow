jest.mock('../../../config/database', () => ({ query: jest.fn() }));
const db = require('../../../config/database');
const VentaRepository = require('../../../repositories/Tenant/VentaRepository');

describe('VentaRepository.getAllWithFilters', () => {
    beforeEach(() => {
        db.query.mockReset();
        db.query.mockResolvedValue([[{ id: 1 }]]);
    });

    it('paginated: selects the page ids first, binds filters before LIMIT/OFFSET', async () => {
        await VentaRepository.getAllWithFilters(7, { formaPago: 'efectivo' }, { page: 3, limit: 20 });
        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toMatch(/FROM \(\s*SELECT f\.id FROM facturas f/);
        expect(sql).toMatch(/LIMIT \? OFFSET \?\s*\) pagina/);
        expect(params).toEqual([7, 'efectivo', 20, 40]);
    });

    it('not paginated: keeps the original single query with no LIMIT', async () => {
        await VentaRepository.getAllWithFilters(7, {});
        const [sql, params] = db.query.mock.calls[0];
        expect(sql).not.toMatch(/LIMIT/);
        expect(sql).toMatch(/WHERE 1=1 AND f\.tenant_id = \?/);
        expect(params).toEqual([7]);
    });
});
