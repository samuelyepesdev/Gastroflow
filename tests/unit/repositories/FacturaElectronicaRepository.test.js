jest.mock('../../../config/database', () => ({ query: jest.fn() }));

const db = require('../../../config/database');
const FacturaElectronicaRepository = require('../../../repositories/Tenant/FacturaElectronicaRepository');

beforeEach(() => jest.clearAllMocks());

describe('FacturaElectronicaRepository.reintentar', () => {
    it('reinicia los intentos y la deja pendiente e inmediata', async () => {
        db.query.mockResolvedValue([{ affectedRows: 1 }]);
        expect(await FacturaElectronicaRepository.reintentar(10, 3)).toBe(true);
        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toMatch(/estado = 'pendiente'/);
        expect(sql).toMatch(/proximo_intento = NULL/);
        expect(sql).toMatch(/intentos = 0/);
        expect(params).toEqual([10, 3]); // siempre acotado al tenant
    });

    it('NUNCA toca una factura ya emitida (reenviarla duplicaría el documento ante la DIAN)', async () => {
        db.query.mockResolvedValue([{ affectedRows: 0 }]);
        expect(await FacturaElectronicaRepository.reintentar(10, 3)).toBe(false);
        expect(db.query.mock.calls[0][0]).toMatch(/estado <> 'emitida'/);
    });
});

describe('FacturaElectronicaRepository.getFacturaCompletaParaEmision', () => {
    it('une el cliente con LEFT JOIN: una factura sin cliente se emite como consumidor final', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 1, numero: 5, cliente_nombre: null, numero_documento: null }]])
            .mockResolvedValueOnce([[]]);

        const datos = await FacturaElectronicaRepository.getFacturaCompletaParaEmision(1, 3);

        expect(db.query.mock.calls[0][0]).toMatch(/LEFT JOIN clientes c/);
        expect(datos).not.toBeNull(); // antes (JOIN interno) devolvía null y la emisión fallaba
        expect(datos.factura.numero_documento).toBeNull();
    });

    it('factura inexistente o de otro tenant: null', async () => {
        db.query.mockResolvedValueOnce([[]]);
        expect(await FacturaElectronicaRepository.getFacturaCompletaParaEmision(1, 3)).toBeNull();
        expect(db.query.mock.calls[0][1]).toEqual([1, 3]);
    });
});
