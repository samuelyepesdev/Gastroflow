jest.mock('../../../config/database', () => ({ query: jest.fn(), getConnection: jest.fn() }));

const db = require('../../../config/database');
const MesaRepository = require('../../../repositories/Tenant/MesaRepository');
const POSRepository = require('../../../repositories/Tenant/POSRepository');

describe('consultas sin funciones sobre la columna filtrada (pueden usar índice)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        db.query.mockResolvedValue([[]]);
    });

    test('MesaRepository.findAbiertasHace compara created_at directo, equivalente a TIMESTAMPDIFF(HOUR) > h', async () => {
        await MesaRepository.findAbiertasHace(3, 4);
        const [sql, params] = db.query.mock.calls[0];
        expect(sql).not.toMatch(/WHERE[\s\S]*TIMESTAMPDIFF/); // solo queda en el SELECT (columna calculada)
        expect(sql).toMatch(/p\.created_at <= DATE_SUB\(NOW\(\), INTERVAL \? HOUR\)/);
        // horas completas transcurridas > 4  <=>  >= 5 horas
        expect(params).toEqual([3, 5]);
    });

    test.each([
        [0, 1],
        [1.5, 2],
        ['6', 7]
    ])('umbral %p horas -> INTERVAL %p HOUR', async (horas, esperado) => {
        await MesaRepository.findAbiertasHace(1, horas);
        expect(db.query.mock.calls[0][1]).toEqual([1, esperado]);
    });

    test('POSRepository.findOrCreateCliente busca por nombre sin LOWER() y recortado', async () => {
        db.query.mockResolvedValueOnce([[{ id: 12 }]]);
        const id = await POSRepository.findOrCreateCliente(3, '  María  ');
        const [sql, params] = db.query.mock.calls[0];
        expect(sql).not.toMatch(/LOWER/i);
        expect(sql).toMatch(/nombre = \?/);
        expect(params).toEqual([3, 'María']);
        expect(id).toBe(12);
    });
});
