jest.mock('../../../config/database', () => ({ getConnection: jest.fn(), query: jest.fn() }));

const db = require('../../../config/database');
const CajaRepository = require('../../../repositories/Tenant/CajaRepository');
const POSRepository = require('../../../repositories/Tenant/POSRepository');

function crearConn() {
    return {
        beginTransaction: jest.fn(),
        commit: jest.fn(),
        rollback: jest.fn(),
        release: jest.fn(),
        query: jest.fn()
    };
}

describe('CajaRepository.cerrarSesion es atómico y no cierra dos veces', () => {
    let conn;
    beforeEach(() => {
        jest.clearAllMocks();
        conn = crearConn();
        db.getConnection.mockResolvedValue(conn);
    });

    test('turno ya cerrado: 409, rollback y ningún UPDATE', async () => {
        conn.query.mockResolvedValueOnce([[]]); // SELECT ... FOR UPDATE sin filas abiertas
        await expect(CajaRepository.cerrarSesion(9, 1, 1000, 'x')).rejects.toMatchObject({ status: 409 });
        expect(conn.rollback).toHaveBeenCalled();
        expect(conn.commit).not.toHaveBeenCalled();
        expect(conn.release).toHaveBeenCalled();
        expect(conn.query.mock.calls.some(([sql]) => /UPDATE caja_sesiones/.test(sql))).toBe(false);
    });

    test('cierra en transacción con la fila bloqueada y el UPDATE exige estado abierta', async () => {
        conn.query.mockImplementation(async sql => {
            if (/FOR UPDATE/.test(sql)) {
                return [[{ id: 9 }]];
            }
            if (/FROM caja_sesiones WHERE id/.test(sql)) {
                return [[{ monto_inicial_efectivo: 100, monto_inicial_transferencia: 0, monto_inicial: 100 }]];
            }
            return [[{ total: 0, neto: 0 }]];
        });
        await CajaRepository.cerrarSesion(9, 1, 100, 'ok');
        expect(conn.beginTransaction).toHaveBeenCalled();
        expect(conn.commit).toHaveBeenCalled();
        expect(conn.release).toHaveBeenCalled();
        const update = conn.query.mock.calls.find(([sql]) => /UPDATE caja_sesiones/.test(sql));
        expect(update[0]).toMatch(/estado = 'abierta'/);
        expect(db.query).not.toHaveBeenCalled(); // nada fuera de la transacción
    });
});

describe('POSRepository.resincronizarItemsPedido es transaccional', () => {
    let conn;
    beforeEach(() => {
        jest.clearAllMocks();
        conn = crearConn();
        db.getConnection.mockResolvedValue(conn);
        db.query.mockResolvedValue([[{ id: 5 }]]); // pedido de caja existe
    });

    test('si falla la reinserción se hace rollback (el DELETE no queda confirmado)', async () => {
        jest.spyOn(POSRepository, '_insertarItemsPedido').mockRejectedValue(new Error('fk'));
        await expect(
            POSRepository.resincronizarItemsPedido(1, 5, [{ producto_id: 1, cantidad: 1, precio: 10 }])
        ).rejects.toThrow('fk');
        expect(conn.query).toHaveBeenCalledWith('DELETE FROM pedido_items WHERE pedido_id = ?', [5]);
        expect(conn.rollback).toHaveBeenCalled();
        expect(conn.commit).not.toHaveBeenCalled();
        expect(conn.release).toHaveBeenCalled();
    });

    test('camino feliz: DELETE, inserción y total en la misma conexión y commit', async () => {
        jest.spyOn(POSRepository, '_insertarItemsPedido').mockResolvedValue(30);
        const r = await POSRepository.resincronizarItemsPedido(1, 5, [{ producto_id: 1, cantidad: 1, precio: 30 }]);
        expect(r).toEqual({ pedidoId: 5 });
        expect(POSRepository._insertarItemsPedido).toHaveBeenCalledWith(conn, 1, 5, expect.any(Array));
        expect(conn.commit).toHaveBeenCalled();
    });
});
