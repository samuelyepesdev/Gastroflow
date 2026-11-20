const db = require('../../../config/database');
const AsistenteRepository = require('../../../repositories/Tenant/AsistenteRepository');

jest.mock('../../../config/database', () => ({ query: jest.fn() }));

const sqlDe = llamada => llamada[0].replace(/\s+/g, ' ');

describe('AsistenteRepository: mesas físicas vs virtuales', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        db.query.mockResolvedValue([[]]);
    });

    it('listarMesasFisicas solo trae mesas del salón (no las filas virtuales POS-n / WA-xxxx) del tenant', async () => {
        await AsistenteRepository.listarMesasFisicas(7);

        const [sql, params] = db.query.mock.calls[0];
        expect(sqlDe([sql])).toMatch(/tenant_id = \? AND tipo = 'fisica'/);
        expect(params).toEqual([7]);
    });

    it('listarMesas sigue trayendo todas: el resolver necesita las virtuales para "domicilio"', async () => {
        await AsistenteRepository.listarMesas(7);

        expect(sqlDe(db.query.mock.calls[0])).not.toMatch(/fisica/);
    });

    it('mesasOcupadasSinItems nunca propone mesas virtuales (una orden del POS vacía no se libera sola)', async () => {
        await AsistenteRepository.mesasOcupadasSinItems(7);

        expect(sqlDe(db.query.mock.calls[0])).toMatch(/m\.tipo = 'fisica'/);
    });
});
