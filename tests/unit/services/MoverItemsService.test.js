jest.mock('../../../config/database', () => ({ getConnection: jest.fn() }));
jest.mock('../../../services/Shared/RealtimeEvents', () => ({ emitMesasChanged: jest.fn() }));

const db = require('../../../config/database');
const RealtimeEvents = require('../../../services/Shared/RealtimeEvents');
const MoverItemsService = require('../../../services/Tenant/Mesas/MoverItemsService');

const origen = { id: 10, mesa_id: 1, cliente_id: 4, estado: 'abierto' };

/** conn.query por texto de la consulta (el orden exacto no importa). */
function crearConn(respuestas = {}) {
    const conn = {
        beginTransaction: jest.fn(),
        commit: jest.fn(),
        rollback: jest.fn(),
        release: jest.fn(),
        query: jest.fn(async sql => {
            for (const [patron, valor] of Object.entries(respuestas)) {
                if (sql.includes(patron)) {
                    return typeof valor === 'function' ? valor(sql) : valor;
                }
            }
            return [{ affectedRows: 1 }];
        })
    };
    db.getConnection.mockResolvedValue(conn);
    return conn;
}

const base = {
    'FROM pedidos WHERE id = ?': [[origen]],
    'FROM mesas WHERE id = ?': [[{ id: 2, numero: 5 }]],
    'FROM pedidos WHERE mesa_id = ? AND tenant_id': [[{ id: 20 }]],
    'UPDATE pedido_items SET pedido_id': [{ affectedRows: 2 }],
    'SELECT COUNT(*) as cnt FROM pedido_items': [[{ cnt: 1 }]]
};

const llamar = (extra = {}) =>
    MoverItemsService.execute({ tenantId: 1, pedidoOrigenId: 10, itemIds: [100, 101], mesa_destino_id: 2, ...extra });

beforeEach(() => jest.clearAllMocks());

describe('MoverItemsService', () => {
    it('mueve los productos, recalcula el total de AMBOS pedidos y avisa en tiempo real', async () => {
        const conn = crearConn(base);
        await expect(llamar()).resolves.toMatchObject({ success: true });

        const totales = conn.query.mock.calls.filter(([sql]) => /UPDATE pedidos SET total = \(/.test(sql));
        expect(totales.map(([, p]) => p[1])).toEqual([10, 20]); // origen y destino
        expect(totales[0][0]).toMatch(/estado <> 'cancelado'/);
        expect(conn.commit).toHaveBeenCalledTimes(1);
        expect(RealtimeEvents.emitMesasChanged).toHaveBeenCalledWith(1);
    });

    it('busca el pedido abierto de la mesa destino con tenant_id y FOR UPDATE', async () => {
        const conn = crearConn(base);
        await llamar();
        const [sql, params] = conn.query.mock.calls.find(([s]) => s.includes('FROM pedidos WHERE mesa_id = ?'));
        expect(sql).toMatch(/tenant_id = \?/);
        expect(sql).toMatch(/FOR UPDATE/);
        expect(params).toEqual([2, 1]);
    });

    it.each(['cerrado', 'cancelado'])('un pedido de origen %s no se reparte', async estado => {
        const conn = crearConn({ ...base, 'FROM pedidos WHERE id = ?': [[{ ...origen, estado }]] });
        await expect(llamar()).rejects.toMatchObject({ code: 'PEDIDO_CERRADO' });
        expect(conn.rollback).toHaveBeenCalled();
        expect(conn.commit).not.toHaveBeenCalled();
        expect(conn.query.mock.calls.some(([sql]) => /UPDATE pedido_items/.test(sql))).toBe(false);
    });

    it('si algún producto ya no está en el pedido, falla y revierte (no deja un pedido vacío en la mesa destino)', async () => {
        const conn = crearConn({
            ...base,
            'FROM pedidos WHERE mesa_id = ? AND tenant_id': [[]], // mesa destino sin pedido: se crea uno
            'INSERT INTO pedidos': [{ insertId: 77 }],
            'UPDATE pedido_items SET pedido_id': [{ affectedRows: 0 }]
        });
        await expect(llamar()).rejects.toMatchObject({ code: 'ITEMS_NO_DISPONIBLES' });
        expect(conn.rollback).toHaveBeenCalledTimes(1);
        expect(conn.commit).not.toHaveBeenCalled();
        expect(RealtimeEvents.emitMesasChanged).not.toHaveBeenCalled();
    });

    it('un id repetido en la selección no cuenta dos veces', async () => {
        const conn = crearConn({ ...base, 'UPDATE pedido_items SET pedido_id': [{ affectedRows: 1 }] });
        await expect(llamar({ itemIds: [100, 100, '100'] })).resolves.toMatchObject({ success: true });
        const [, params] = conn.query.mock.calls.find(([sql]) => /UPDATE pedido_items/.test(sql));
        expect(params[1]).toEqual([100]);
    });

    it('si el origen queda sin productos se cancela y se libera su mesa (si no tiene otros pedidos)', async () => {
        const conn = crearConn({
            ...base,
            'SELECT COUNT(*) as cnt FROM pedido_items': [[{ cnt: 0 }]],
            'SELECT COUNT(*) as cnt FROM pedidos': [[{ cnt: 0 }]]
        });
        await llamar();
        expect(conn.query.mock.calls.some(([sql]) => /SET estado = 'cancelado' WHERE id = \?/.test(sql))).toBe(true);
        const libre = conn.query.mock.calls.find(([sql]) => /mesas SET estado = "libre"/.test(sql));
        expect(libre[1]).toEqual([1, 1]); // filtra por tenant
    });

    it('sin productos, pedido o mesa inexistente: errores claros y sin tocar nada', async () => {
        await expect(llamar({ itemIds: [] })).rejects.toMatchObject({ code: 'ITEMS_REQUERIDOS' });
        expect(db.getConnection).not.toHaveBeenCalled();

        crearConn({ ...base, 'FROM pedidos WHERE id = ?': [[]] });
        await expect(llamar()).rejects.toMatchObject({ code: 'PEDIDO_NO_ENCONTRADO' });

        crearConn({ ...base, 'FROM mesas WHERE id = ?': [[]] });
        await expect(llamar()).rejects.toMatchObject({ code: 'MESA_NO_ENCONTRADA' });
    });
});
