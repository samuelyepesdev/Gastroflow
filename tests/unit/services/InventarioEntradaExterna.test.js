jest.mock('../../../config/database', () => ({ query: jest.fn(), getConnection: jest.fn() }));
jest.mock('../../../repositories/Tenant/InsumoRepository');
jest.mock('../../../repositories/Tenant/MovimientoInventarioRepository');
jest.mock('../../../repositories/Tenant/RecetaRepository');
jest.mock('../../../repositories/Tenant/ComboRepository');
jest.mock('../../../repositories/Tenant/ComboVentaRepository');
jest.mock('../../../services/Tenant/FinanzasService', () => ({
    registrarGastoInventario: jest.fn().mockResolvedValue(1)
}));

const db = require('../../../config/database');
const InsumoRepository = require('../../../repositories/Tenant/InsumoRepository');
const InventarioService = require('../../../services/Tenant/InventarioService');

const T = 3;
const insumo = { id: 5, nombre: 'Tomate', stock_actual: 10, stock_valorizado: 10, costo_promedio: 2000 };

function crearConn() {
    return {
        beginTransaction: jest.fn(),
        commit: jest.fn(),
        rollback: jest.fn(),
        release: jest.fn(),
        query: jest.fn().mockResolvedValue([{}])
    };
}

describe('InventarioService.registrarEntrada con transacción ajena (recepción de órdenes de compra)', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        InsumoRepository.findById.mockResolvedValue(insumo);
    });

    it('con `externa`: lee y escribe por ELLA, sin abrir conexión propia ni hacer commit/rollback/release', async () => {
        const externa = crearConn();
        await InventarioService.registrarEntrada(T, { insumo_id: 5, cantidad: 4, costo_unitario: 2500 }, externa);

        expect(InsumoRepository.findById).toHaveBeenCalledWith(5, T, externa);
        expect(db.getConnection).not.toHaveBeenCalled();
        expect(externa.beginTransaction).not.toHaveBeenCalled();
        expect(externa.commit).not.toHaveBeenCalled();
        expect(externa.rollback).not.toHaveBeenCalled();
        expect(externa.release).not.toHaveBeenCalled();
        expect(externa.query.mock.calls.some(([sql]) => /INSERT INTO movimientos_inventario/.test(sql))).toBe(true);
        expect(externa.query.mock.calls.some(([sql]) => /UPDATE insumos/.test(sql))).toBe(true);
    });

    it('si falla con `externa`, propaga el error y deja el rollback a quien abrió la transacción', async () => {
        const externa = crearConn();
        externa.query.mockRejectedValueOnce(new Error('INSERT falló'));
        await expect(
            InventarioService.registrarEntrada(T, { insumo_id: 5, cantidad: 4, costo_unitario: 2500 }, externa)
        ).rejects.toThrow('INSERT falló');
        expect(externa.rollback).not.toHaveBeenCalled();
        expect(externa.release).not.toHaveBeenCalled();
    });

    it('sin `externa` conserva su propia transacción (comportamiento de siempre)', async () => {
        const propia = crearConn();
        db.getConnection.mockResolvedValue(propia);
        await InventarioService.registrarEntrada(T, { insumo_id: 5, cantidad: 4, costo_unitario: 2500 });

        expect(InsumoRepository.findById).toHaveBeenCalledWith(5, T, null);
        expect(propia.beginTransaction).toHaveBeenCalledTimes(1);
        expect(propia.commit).toHaveBeenCalledTimes(1);
        expect(propia.release).toHaveBeenCalledTimes(1);
    });
});
