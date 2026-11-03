/**
 * EventoRepository: al cambiar "incluir en ventas normales" las facturas del evento se re-marcan
 * (facturas.evento_aparte) en la misma transacción que el evento.
 */
jest.mock('../../../config/database', () => ({ query: jest.fn(), getConnection: jest.fn() }));

const db = require('../../../config/database');
const EventoRepository = require('../../../repositories/Tenant/EventoRepository');

let conn;
const datos = extra => ({
    nombre: 'Feria',
    fecha_inicio: '2026-12-01',
    fecha_fin: '2026-12-05',
    descripcion: null,
    ...extra
});

beforeEach(() => {
    jest.resetAllMocks();
    conn = {
        beginTransaction: jest.fn(),
        commit: jest.fn(),
        rollback: jest.fn(),
        release: jest.fn(),
        query: jest.fn()
    };
    db.getConnection.mockResolvedValue(conn);
});

describe('EventoRepository.update', () => {
    it('incluir en ventas: las facturas dejan de ir aparte (evento_aparte = 0) en la misma transacción', async () => {
        await EventoRepository.update(7, 1, datos({ incluir_en_ventas: true }));
        const sentencias = conn.query.mock.calls.map(c => c[0]);
        expect(sentencias[0]).toMatch(/UPDATE eventos SET .*incluir_en_ventas = \?/);
        expect(sentencias[1]).toMatch(/UPDATE facturas SET evento_aparte = \?/);
        expect(conn.query.mock.calls[1][1]).toEqual([0, 7, 1]);
        expect(conn.commit).toHaveBeenCalled();
        expect(conn.release).toHaveBeenCalled();
    });

    it('sacarlo de las ventas: las facturas vuelven aparte (evento_aparte = 1)', async () => {
        await EventoRepository.update(7, 1, datos({ incluir_en_ventas: false }));
        expect(conn.query.mock.calls[1][1]).toEqual([1, 7, 1]);
    });

    it('sin el campo no toca las facturas', async () => {
        await EventoRepository.update(7, 1, datos({}));
        expect(conn.query).toHaveBeenCalledTimes(1);
        expect(conn.query.mock.calls[0][0]).not.toMatch(/incluir_en_ventas/);
    });

    it('si falla algo hace rollback y libera la conexión', async () => {
        conn.query.mockRejectedValueOnce(new Error('boom'));
        await expect(EventoRepository.update(7, 1, datos({ incluir_en_ventas: true }))).rejects.toThrow('boom');
        expect(conn.rollback).toHaveBeenCalled();
        expect(conn.commit).not.toHaveBeenCalled();
        expect(conn.release).toHaveBeenCalled();
    });
});

describe('EventoRepository.create', () => {
    it('guarda incluir_en_ventas como 1/0', async () => {
        db.query.mockResolvedValue([{ insertId: 3 }]);
        await EventoRepository.create(1, datos({ incluir_en_ventas: true }));
        await EventoRepository.create(1, datos({}));
        expect(db.query.mock.calls[0][1].at(-1)).toBe(1);
        expect(db.query.mock.calls[1][1].at(-1)).toBe(0);
    });
});
