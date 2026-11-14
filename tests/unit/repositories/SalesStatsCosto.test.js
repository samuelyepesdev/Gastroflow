jest.mock('../../../config/database', () => ({ query: jest.fn() }));

const db = require('../../../config/database');
const SalesStatsRepository = require('../../../repositories/Tenant/Stats/SalesStatsRepository');

const contar = (sql, car) => sql.split(car).length - 1;

describe('SalesStatsRepository.getTotalsByPaymentMethod: subconsulta de servicios externos acotada', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        db.query.mockResolvedValue([[]]);
    });

    test('sin rango: filtra por tenant en servicios, facturas y consulta externa; placeholders = params', async () => {
        await SalesStatsRepository.getTotalsByPaymentMethod(7, {});
        const [sql, params] = db.query.mock.calls[0];
        expect(params).toEqual([7, 7, 7]);
        expect(contar(sql, '?')).toBe(params.length);
        expect(sql).toMatch(/s\.tenant_id = \?/);
        expect(sql).toMatch(/fx\.tenant_id = \?/);
    });

    test('con rango: la subconsulta también se acota por fecha y el orden de params calza', async () => {
        await SalesStatsRepository.getTotalsByPaymentMethod(7, { desde: '2026-11-01', hasta: '2026-11-30' });
        const [sql, params] = db.query.mock.calls[0];
        expect(contar(sql, '?')).toBe(params.length);
        expect(params).toHaveLength(7);
        // [tenant servicios, tenant facturas, desde, hasta (subconsulta), tenant externo, desde, hasta]
        expect(params[0]).toBe(7);
        expect(params[1]).toBe(7);
        expect(params[4]).toBe(7);
        expect(params[2]).toBe(params[5]);
        expect(params[3]).toBe(params[6]);
        expect(sql).toMatch(/fx\.fecha BETWEEN \? AND \?/);
        expect(sql).not.toMatch(/__RANGO_FX__/);
    });
});

describe('SalesStatsRepository.getTotalesAllTime', () => {
    beforeEach(() => jest.clearAllMocks());

    test('una sola consulta devuelve total y cantidad', async () => {
        db.query.mockResolvedValue([[{ total: '1500.5', cantidad: '3' }]]);
        const r = await SalesStatsRepository.getTotalesAllTime(7);
        expect(db.query).toHaveBeenCalledTimes(1);
        expect(r).toEqual({ total: 1500.5, cantidad: 3 });
    });
});
