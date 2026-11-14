jest.mock('../../../config/database', () => ({ query: jest.fn(), getConnection: jest.fn() }));
jest.mock('../../../repositories/Tenant/ComboVentaRepository');
jest.mock('../../../repositories/Tenant/ComboRepository');
jest.mock('../../../repositories/Tenant/RecetaRepository');
jest.mock('../../../repositories/Tenant/InsumoRepository');
jest.mock('../../../repositories/Tenant/MovimientoInventarioRepository');

const db = require('../../../config/database');
const ComboRepository = require('../../../repositories/Tenant/ComboRepository');
const RecetaRepository = require('../../../repositories/Tenant/RecetaRepository');
const InsumoRepository = require('../../../repositories/Tenant/InsumoRepository');
const InventarioService = require('../../../services/Tenant/InventarioService');

const T = 3;

function crearConn() {
    return {
        beginTransaction: jest.fn(),
        commit: jest.fn(),
        rollback: jest.fn(),
        release: jest.fn(),
        query: jest.fn()
    };
}

describe('InventarioService.registrarSalidasLote', () => {
    let conn;
    beforeEach(() => {
        jest.resetAllMocks();
        conn = crearConn();
        db.getConnection.mockResolvedValue(conn);
        InsumoRepository.findByIds.mockResolvedValue(
            new Map([
                [1, { id: 1, nombre: 'Harina', stock_actual: 1000, costo_promedio: 2 }],
                [2, { id: 2, nombre: 'Azúcar', stock_actual: 5, costo_promedio: 3 }]
            ])
        );
    });

    it('una sola conexión y transacción para todos los insumos, sumando repetidos y en orden de id', async () => {
        await InventarioService.registrarSalidasLote(
            T,
            [
                { insumo_id: 2, cantidad: 10 },
                { insumo_id: 1, cantidad: 100 },
                { insumo_id: 1, cantidad: 50 }
            ],
            'factura_9'
        );
        expect(db.getConnection).toHaveBeenCalledTimes(1);
        expect(conn.beginTransaction).toHaveBeenCalledTimes(1);
        expect(conn.commit).toHaveBeenCalledTimes(1);
        expect(conn.release).toHaveBeenCalledTimes(1);

        const updates = conn.query.mock.calls.filter(([sql]) => /UPDATE insumos/.test(sql));
        expect(updates.map(([, p]) => [p[2], p[0]])).toEqual([
            [1, 150], // insumo 1 primero (orden por id) y con 100+50 sumados
            [2, 10]
        ]);
        const inserts = conn.query.mock.calls.filter(([sql]) => /INSERT INTO movimientos_inventario/.test(sql));
        expect(inserts).toHaveLength(2);
        expect(inserts[0][1]).toEqual([T, 1, 150, 2, 'factura_9']);
    });

    it('permite stock negativo (avisa pero descuenta) igual que registrarSalida', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        await InventarioService.registrarSalidasLote(T, [{ insumo_id: 2, cantidad: 10 }], 'x'); // stock 5
        expect(warn).toHaveBeenCalled();
        expect(conn.commit).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('si falla un UPDATE hace rollback de todo el lote', async () => {
        conn.query.mockImplementation(async sql => {
            if (/UPDATE insumos/.test(sql)) {
                throw new Error('boom');
            }
            return [{}];
        });
        await expect(InventarioService.registrarSalidasLote(T, [{ insumo_id: 1, cantidad: 1 }], 'x')).rejects.toThrow(
            'boom'
        );
        expect(conn.rollback).toHaveBeenCalled();
        expect(conn.commit).not.toHaveBeenCalled();
        expect(conn.release).toHaveBeenCalled();
    });

    it('sin cantidades válidas o con insumos ajenos no abre conexión', async () => {
        await InventarioService.registrarSalidasLote(T, [{ insumo_id: 1, cantidad: 0 }], 'x');
        await InventarioService.registrarSalidasLote(T, [{ insumo_id: 99, cantidad: 5 }], 'x'); // no está en findByIds
        expect(db.getConnection).not.toHaveBeenCalled();
    });
});

describe('InventarioService.descontarProductosLote', () => {
    let conn;
    beforeEach(() => {
        jest.resetAllMocks();
        conn = crearConn();
        db.getConnection.mockResolvedValue(conn);
        ComboRepository.getComponentes.mockResolvedValue([]);
        InsumoRepository.findByIds.mockResolvedValue(
            new Map([[1, { id: 1, nombre: 'Harina', unidad_base: 'g', stock_actual: 9999, costo_promedio: 1 }]])
        );
        RecetaRepository.findByProductoId.mockResolvedValue({ id: 50, porciones: 1 });
        RecetaRepository.getIngredientes.mockResolvedValue([{ insumo_id: 1, cantidad: 100, unidad: 'g' }]);
    });

    it('5 platos de 6 ingredientes -> UNA transacción con los insumos sumados', async () => {
        await InventarioService.descontarProductosLote(
            T,
            [
                { producto_id: 10, cantidad: 2 },
                { producto_id: 11, cantidad: 3 }
            ],
            'factura_1'
        );
        expect(db.getConnection).toHaveBeenCalledTimes(1);
        const updates = conn.query.mock.calls.filter(([sql]) => /UPDATE insumos/.test(sql));
        expect(updates).toHaveLength(1);
        expect(updates[0][1][0]).toBe(500); // (2+3) platos x 100 g
    });

    it('un combo se expande a sus componentes x cantidad', async () => {
        ComboRepository.getComponentes.mockResolvedValue([{ producto_id: 20, cantidad: '2' }]);
        await InventarioService.descontarProductosLote(T, [{ producto_id: 99, cantidad: 3 }], 'factura_1');
        const upd = conn.query.mock.calls.find(([sql]) => /UPDATE insumos/.test(sql));
        expect(upd[1][0]).toBe(600); // 3 combos x 2 componentes x 100 g
    });

    it('con la conexión de la venta, NINGUNA lectura (combos, receta, ingredientes, insumos) usa el pool', async () => {
        const venta = crearConn();
        ComboRepository.getComponentes.mockResolvedValueOnce([{ producto_id: 20, cantidad: '1' }]);
        await InventarioService.descontarProductosLote(
            T,
            [
                { producto_id: 99, cantidad: 1 },
                { producto_id: 10, cantidad: 1 }
            ],
            'factura_1',
            venta
        );
        for (const mock of [ComboRepository.getComponentes, RecetaRepository.findByProductoId]) {
            expect(mock.mock.calls.length).toBeGreaterThan(0);
            for (const llamada of mock.mock.calls) {
                expect(llamada[2]).toBe(venta);
            }
        }
        for (const llamada of RecetaRepository.getIngredientes.mock.calls) {
            expect(llamada[1]).toBe(venta);
        }
        for (const llamada of InsumoRepository.findByIds.mock.calls) {
            expect(llamada[2]).toBe(venta);
        }
        expect(db.getConnection).not.toHaveBeenCalled(); // escribe en la transacción de la venta
        expect(venta.beginTransaction).not.toHaveBeenCalled();
    });

    it('una receta rota no impide descontar los demás productos', async () => {
        const err = jest.spyOn(console, 'error').mockImplementation(() => {});
        RecetaRepository.findByProductoId.mockRejectedValueOnce(new Error('receta rota'));
        await InventarioService.descontarProductosLote(
            T,
            [
                { producto_id: 10, cantidad: 1 },
                { producto_id: 11, cantidad: 1 }
            ],
            'factura_1'
        );
        const upd = conn.query.mock.calls.find(([sql]) => /UPDATE insumos/.test(sql));
        expect(upd[1][0]).toBe(100); // solo el producto 11
        expect(err).toHaveBeenCalled();
        err.mockRestore();
    });
});
