jest.mock('../../../config/database', () => ({
    query: jest.fn(),
    getConnection: jest.fn()
}));
jest.mock('../../../repositories/Tenant/PedidoItemPagoRepository');
jest.mock('../../../services/Shared/RealtimeEvents', () => ({ emitPedido: jest.fn() }));

const db = require('../../../config/database');
const PedidoItemPagoRepository = require('../../../repositories/Tenant/PedidoItemPagoRepository');
const RealtimeEvents = require('../../../services/Shared/RealtimeEvents');
const PagarItemIndividualService = require('../../../services/Tenant/Mesas/PagarItemIndividualService');
const PagarMultiplesItemsService = require('../../../services/Tenant/Mesas/PagarMultiplesItemsService');

const itemRow = {
    id: 5,
    cantidad: 2,
    precio_unitario: 8000,
    pedido_id: 10,
    producto_id: 3,
    unidad_medida: 'UND',
    estado: 'servido',
    nota: null,
    enviado_at: null,
    preparado_at: null,
    listo_at: null,
    servido_at: null,
    subtotal: 16000,
    modificadores_hash: null,
    pagado: 0,
    mesa_id: 1,
    pedido_estado: 'abierto'
};

function crearConn() {
    return {
        beginTransaction: jest.fn(),
        commit: jest.fn(),
        rollback: jest.fn(),
        release: jest.fn(),
        query: jest.fn()
    };
}

describe('PagarItemIndividualService', () => {
    let conn;

    beforeEach(() => {
        jest.resetAllMocks();
        conn = crearConn();
        db.getConnection.mockResolvedValue(conn);
    });

    it('registra el pago completo del item con la cantidad, monto y usuario correctos', async () => {
        conn.query
            .mockResolvedValueOnce([[itemRow]]) // SELECT item FOR UPDATE
            .mockResolvedValueOnce([[]]) // SELECT existingPaidRows (ninguna fila ya pagada de este producto)
            .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE pedido_items SET pagado = 1 ...

        await PagarItemIndividualService.execute({
            tenantId: 1,
            itemId: 5,
            forma_pago: 'efectivo',
            cantidad: 2,
            usuarioId: 7,
            skipEvent: true
        });

        expect(PedidoItemPagoRepository.create).toHaveBeenCalledWith(
            {
                tenantId: 1,
                pedidoId: 10,
                productoId: 3,
                cantidad: 2,
                monto: 16000, // 2 * 8000
                formaPago: 'efectivo',
                usuarioId: 7
            },
            conn
        );
    });

    it('registra solo la cantidad pagada, no la del item completo, en un pago parcial', async () => {
        conn.query
            .mockResolvedValueOnce([[itemRow]]) // SELECT item (cantidad total = 2)
            .mockResolvedValueOnce([[]]) // sin fila ya pagada
            .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE deja la porción pagada
            .mockResolvedValueOnce([{ insertId: 99 }]) // INSERT del sobrante como nueva fila sin pagar
            .mockResolvedValueOnce([[]]); // SELECT pedido_item_modificadores del item original (sin toppings)

        await PagarItemIndividualService.execute({
            tenantId: 1,
            itemId: 5,
            forma_pago: 'transferencia',
            cantidad: 1, // paga solo 1 de las 2 unidades
            usuarioId: 9,
            skipEvent: true
        });

        expect(PedidoItemPagoRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({ cantidad: 1, monto: 8000, formaPago: 'transferencia', usuarioId: 9 }),
            conn
        );
    });

    it('no lanza si falla el registro de auditoría (no bloqueante: el pago del item ya se aplicó)', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
        conn.query
            .mockResolvedValueOnce([[itemRow]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);
        PedidoItemPagoRepository.create.mockRejectedValue(new Error('auditoría caída'));

        await expect(
            PagarItemIndividualService.execute({
                tenantId: 1,
                itemId: 5,
                forma_pago: 'efectivo',
                cantidad: 2,
                usuarioId: 7,
                skipEvent: true
            })
        ).resolves.toEqual({ message: 'Item pagado correctamente' });
        expect(conn.commit).toHaveBeenCalled();
    });

    it('busca la fila ya pagada a fusionar por precio, modificadores y SIN contar la propia línea', async () => {
        const itemConTopping = { ...itemRow, precio_unitario: 14000, modificadores_hash: '797,802,806' };
        conn.query
            .mockResolvedValueOnce([[itemConTopping]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        await PagarItemIndividualService.execute({
            tenantId: 1,
            itemId: 5,
            forma_pago: 'efectivo',
            cantidad: 2,
            usuarioId: 7,
            skipEvent: true
        });

        const [existingPaidQuery, existingPaidParams] = conn.query.mock.calls[1];
        expect(existingPaidQuery).toMatch(/precio_unitario\s*=\s*\?/);
        expect(existingPaidQuery).toMatch(/modificadores_hash/);
        expect(existingPaidQuery).toMatch(/id <> \?/);
        expect(existingPaidParams).toEqual([10, 3, 'efectivo', 14000, '797,802,806', 5]);
    });

    it('usuarioId es null si no se pasa (compatibilidad con llamadas viejas)', async () => {
        conn.query
            .mockResolvedValueOnce([[itemRow]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        await PagarItemIndividualService.execute({
            tenantId: 1,
            itemId: 5,
            forma_pago: 'efectivo',
            cantidad: 2,
            skipEvent: true
        });

        expect(PedidoItemPagoRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({ usuarioId: null }),
            conn
        );
    });

    describe('integridad', () => {
        it('un ítem YA PAGADO se rechaza sin tocar nada (antes se duplicaba y se borraba la línea)', async () => {
            conn.query.mockResolvedValueOnce([[{ ...itemRow, pagado: 1 }]]);
            await expect(
                PagarItemIndividualService.execute({ tenantId: 1, itemId: 5, forma_pago: 'efectivo', skipEvent: true })
            ).rejects.toMatchObject({ code: 'ITEM_YA_PAGADO' });

            const escrituras = conn.query.mock.calls.filter(([sql]) => /^\s*(UPDATE|DELETE|INSERT)/i.test(sql));
            expect(escrituras).toHaveLength(0);
            expect(conn.rollback).toHaveBeenCalled();
            expect(conn.commit).not.toHaveBeenCalled();
            expect(PedidoItemPagoRepository.create).not.toHaveBeenCalled();
        });

        it('un pedido cerrado o cancelado no admite pagos por ítem', async () => {
            conn.query.mockResolvedValueOnce([[{ ...itemRow, pedido_estado: 'cerrado' }]]);
            await expect(
                PagarItemIndividualService.execute({ tenantId: 1, itemId: 5, forma_pago: 'efectivo', skipEvent: true })
            ).rejects.toMatchObject({ code: 'PEDIDO_CERRADO' });
            expect(conn.rollback).toHaveBeenCalled();
        });

        it('ítem inexistente o de otro restaurante: no encontrado', async () => {
            conn.query.mockResolvedValueOnce([[]]);
            await expect(
                PagarItemIndividualService.execute({ tenantId: 1, itemId: 5, forma_pago: 'efectivo', skipEvent: true })
            ).rejects.toThrow('Item no encontrado');
            expect(conn.query.mock.calls[0][1]).toEqual([5, 1]); // filtra por tenant
        });

        it('lee la línea con FOR UPDATE dentro de una transacción', async () => {
            conn.query
                .mockResolvedValueOnce([[itemRow]])
                .mockResolvedValueOnce([[]])
                .mockResolvedValueOnce([{ affectedRows: 1 }]);
            await PagarItemIndividualService.execute({
                tenantId: 1,
                itemId: 5,
                forma_pago: 'efectivo',
                skipEvent: true
            });
            expect(conn.beginTransaction).toHaveBeenCalledTimes(1);
            expect(conn.query.mock.calls[0][0]).toMatch(/FOR UPDATE/);
            expect(conn.commit).toHaveBeenCalledTimes(1);
            expect(conn.release).toHaveBeenCalledTimes(1);
            expect(db.query).not.toHaveBeenCalled(); // nada sale por el pool
        });

        it('si falla una escritura a medias del pago parcial se revierte TODO', async () => {
            conn.query
                .mockResolvedValueOnce([[itemRow]])
                .mockResolvedValueOnce([[]])
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE porción pagada
                .mockRejectedValueOnce(new Error('INSERT sobrante falló'));
            await expect(
                PagarItemIndividualService.execute({
                    tenantId: 1,
                    itemId: 5,
                    forma_pago: 'efectivo',
                    cantidad: 1,
                    skipEvent: true
                })
            ).rejects.toThrow('INSERT sobrante falló');
            expect(conn.rollback).toHaveBeenCalled();
            expect(conn.commit).not.toHaveBeenCalled();
            expect(conn.release).toHaveBeenCalled();
        });

        it('forma de pago inválida: ni abre transacción', async () => {
            await expect(
                PagarItemIndividualService.execute({ tenantId: 1, itemId: 5, forma_pago: 'cripto' })
            ).rejects.toThrow(/Forma de pago/);
            expect(db.getConnection).not.toHaveBeenCalled();
        });

        it('emite el evento en tiempo real DESPUÉS del commit (y no si skipEvent)', async () => {
            const orden = [];
            conn.commit.mockImplementation(async () => orden.push('commit'));
            RealtimeEvents.emitPedido.mockImplementation(() => orden.push('evento'));
            conn.query
                .mockResolvedValueOnce([[itemRow]])
                .mockResolvedValueOnce([[]])
                .mockResolvedValueOnce([{ affectedRows: 1 }]);
            await PagarItemIndividualService.execute({ tenantId: 1, itemId: 5, forma_pago: 'efectivo' });
            expect(orden).toEqual(['commit', 'evento']);
            expect(RealtimeEvents.emitPedido).toHaveBeenCalledWith(
                expect.objectContaining({ tenantId: 1, pedidoId: 10, mesaId: 1 })
            );
        });
    });
});

describe('PagarMultiplesItemsService', () => {
    let conn;

    beforeEach(() => {
        jest.resetAllMocks();
        conn = crearConn();
        db.getConnection.mockResolvedValue(conn);
        db.query.mockResolvedValue([[{ pedido_id: 10, mesa_id: 1 }]]);
    });

    const pagarItemLibre = () =>
        conn.query
            .mockResolvedValueOnce([[itemRow]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

    it('todo el lote en UNA transacción: un solo commit y un solo evento', async () => {
        pagarItemLibre();
        pagarItemLibre();
        const r = await PagarMultiplesItemsService.execute({
            tenantId: 1,
            forma_pago: 'efectivo',
            items: [
                { itemId: 5, cantidad: 2 },
                { itemId: 6, cantidad: 2 }
            ]
        });
        expect(r.success).toBe(true);
        expect(db.getConnection).toHaveBeenCalledTimes(1);
        expect(conn.beginTransaction).toHaveBeenCalledTimes(1);
        expect(conn.commit).toHaveBeenCalledTimes(1);
        expect(RealtimeEvents.emitPedido).toHaveBeenCalledTimes(1);
    });

    it('si el segundo ítem falla, el primero NO queda cobrado (rollback) y no se emite evento', async () => {
        pagarItemLibre();
        conn.query.mockResolvedValueOnce([[{ ...itemRow, id: 6, pagado: 1 }]]);
        await expect(
            PagarMultiplesItemsService.execute({
                tenantId: 1,
                forma_pago: 'efectivo',
                items: [
                    { itemId: 5, cantidad: 2 },
                    { itemId: 6, cantidad: 2 }
                ]
            })
        ).rejects.toMatchObject({ code: 'ITEM_YA_PAGADO' });
        expect(conn.rollback).toHaveBeenCalledTimes(1);
        expect(conn.commit).not.toHaveBeenCalled();
        expect(conn.release).toHaveBeenCalledTimes(1);
        expect(RealtimeEvents.emitPedido).not.toHaveBeenCalled();
    });

    it('sin ítems o con forma de pago inválida no abre transacción', async () => {
        await expect(
            PagarMultiplesItemsService.execute({ tenantId: 1, forma_pago: 'efectivo', items: [] })
        ).rejects.toThrow(/al menos un ítem/);
        await expect(
            PagarMultiplesItemsService.execute({ tenantId: 1, forma_pago: 'x', items: [{ itemId: 1 }] })
        ).rejects.toThrow(/Forma de pago/);
        expect(db.getConnection).not.toHaveBeenCalled();
    });
});
