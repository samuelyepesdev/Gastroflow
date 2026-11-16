/**
 * Tests unitarios para OrdenCompraService (repositorios e InventarioService mockeados).
 */

jest.mock('../../../config/database', () => ({ getConnection: jest.fn() }));
jest.mock('../../../repositories/Tenant/OrdenCompraRepository', () => ({
    findAll: jest.fn(),
    findById: jest.fn(),
    bloquear: jest.fn(),
    create: jest.fn(),
    marcarRecibida: jest.fn(),
    cancelar: jest.fn()
}));
jest.mock('../../../repositories/Tenant/ProveedorRepository', () => ({
    findById: jest.fn()
}));
jest.mock('../../../repositories/Tenant/InsumoRepository', () => ({
    findById: jest.fn()
}));
jest.mock('../../../services/Tenant/InventarioService', () => ({
    registrarEntrada: jest.fn()
}));

const db = require('../../../config/database');
const OrdenCompraService = require('../../../services/Tenant/OrdenCompraService');
const OrdenCompraRepository = require('../../../repositories/Tenant/OrdenCompraRepository');
const ProveedorRepository = require('../../../repositories/Tenant/ProveedorRepository');
const InsumoRepository = require('../../../repositories/Tenant/InsumoRepository');
const InventarioService = require('../../../services/Tenant/InventarioService');

describe('OrdenCompraService.crear', () => {
    beforeEach(() => jest.clearAllMocks());

    it('rechaza si no hay proveedor', async () => {
        await expect(OrdenCompraService.crear(1, { items: [{ insumo_id: 1, cantidad_pedida: 2 }] })).rejects.toThrow(
            'proveedor es requerido'
        );
    });

    it('rechaza si no hay items', async () => {
        await expect(OrdenCompraService.crear(1, { proveedor_id: 1, items: [] })).rejects.toThrow('al menos un insumo');
    });

    it('rechaza si el proveedor no existe para ese tenant', async () => {
        ProveedorRepository.findById.mockResolvedValue(null);
        await expect(
            OrdenCompraService.crear(1, { proveedor_id: 99, items: [{ insumo_id: 1, cantidad_pedida: 2 }] })
        ).rejects.toThrow('Proveedor no encontrado');
    });

    it('rechaza una línea con cantidad <= 0', async () => {
        ProveedorRepository.findById.mockResolvedValue({ id: 1 });
        await expect(
            OrdenCompraService.crear(1, { proveedor_id: 1, items: [{ insumo_id: 1, cantidad_pedida: 0 }] })
        ).rejects.toThrow('cantidad mayor a 0');
    });

    it('rechaza si un insumo no existe para ese tenant', async () => {
        ProveedorRepository.findById.mockResolvedValue({ id: 1 });
        InsumoRepository.findById.mockResolvedValue(null);
        await expect(
            OrdenCompraService.crear(1, { proveedor_id: 1, items: [{ insumo_id: 77, cantidad_pedida: 2 }] })
        ).rejects.toThrow('Insumo 77 no encontrado');
    });

    it('crea la orden con las líneas normalizadas', async () => {
        ProveedorRepository.findById.mockResolvedValue({ id: 1, nombre: 'Distribuidora X' });
        InsumoRepository.findById.mockResolvedValue({ id: 5, nombre: 'Tomate' });
        OrdenCompraRepository.create.mockResolvedValue(42);

        const result = await OrdenCompraService.crear(1, {
            proveedor_id: 1,
            notas: 'urgente',
            items: [{ insumo_id: 5, cantidad_pedida: '10', costo_unitario_estimado: '2500' }]
        });

        expect(result.id).toBe(42);
        expect(OrdenCompraRepository.create).toHaveBeenCalledWith(1, {
            proveedor_id: 1,
            notas: 'urgente',
            items: [{ insumo_id: 5, cantidad_pedida: 10, costo_unitario_estimado: 2500 }]
        });
    });
});

describe('OrdenCompraService.recibir', () => {
    let conn;

    beforeEach(() => {
        jest.resetAllMocks();
        conn = { beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn() };
        db.getConnection.mockResolvedValue(conn);
        OrdenCompraRepository.bloquear.mockResolvedValue({ id: 1, estado: 'pendiente', proveedor_id: 9 });
        OrdenCompraRepository.findById.mockResolvedValue(ordenPendiente());
    });

    function ordenPendiente() {
        return {
            id: 1,
            proveedor_id: 9,
            estado: 'pendiente',
            items: [
                { id: 100, insumo_id: 5, insumo_nombre: 'Tomate', cantidad_pedida: 10, costo_unitario_estimado: 2500 },
                { id: 101, insumo_id: 6, insumo_nombre: 'Cebolla', cantidad_pedida: 5, costo_unitario_estimado: null }
            ]
        };
    }

    it('rechaza si la orden no existe', async () => {
        OrdenCompraRepository.bloquear.mockResolvedValue(null);
        await expect(OrdenCompraService.recibir(1, 1, [{ id: 100, cantidad_recibida: 10 }])).rejects.toThrow(
            'no encontrada'
        );
        expect(conn.rollback).toHaveBeenCalled();
    });

    it('rechaza si la orden ya no está pendiente (leído con la orden bloqueada: un doble clic no duplica)', async () => {
        OrdenCompraRepository.bloquear.mockResolvedValue({ id: 1, estado: 'recibida' });
        await expect(OrdenCompraService.recibir(1, 1, [{ id: 100, cantidad_recibida: 10 }])).rejects.toThrow(
            'ya está recibida'
        );
        expect(InventarioService.registrarEntrada).not.toHaveBeenCalled();
        expect(conn.rollback).toHaveBeenCalled();
        expect(conn.commit).not.toHaveBeenCalled();
    });

    it('rechaza una línea que no pertenece a la orden', async () => {
        await expect(OrdenCompraService.recibir(1, 1, [{ id: 999, cantidad_recibida: 10 }])).rejects.toThrow(
            'no pertenece a esta orden'
        );
        expect(conn.rollback).toHaveBeenCalled();
    });

    it('sin líneas no abre transacción', async () => {
        await expect(OrdenCompraService.recibir(1, 1, [])).rejects.toThrow('al menos una línea');
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    it('todo en UNA transacción: bloquea la orden y usa la MISMA conexión en entradas y marcarRecibida, un solo commit', async () => {
        const result = await OrdenCompraService.recibir(1, 1, [
            { id: 100, cantidad_recibida: 8 }, // llegó menos de lo pedido
            { id: 101, cantidad_recibida: 0 } // no llegó nada de esta línea
        ]);

        expect(OrdenCompraRepository.bloquear).toHaveBeenCalledWith(1, 1, conn);
        expect(OrdenCompraRepository.findById).toHaveBeenCalledWith(1, 1, conn);
        expect(InventarioService.registrarEntrada).toHaveBeenCalledTimes(1);
        expect(InventarioService.registrarEntrada).toHaveBeenCalledWith(
            1,
            { insumo_id: 5, cantidad: 8, costo_unitario: 2500, proveedor_id: 9, documento_referencia: 'OC-1' },
            conn
        );
        expect(OrdenCompraRepository.marcarRecibida).toHaveBeenCalledWith(
            1,
            1,
            [
                { id: 100, cantidad_recibida: 8 },
                { id: 101, cantidad_recibida: 0 }
            ],
            conn
        );
        expect(conn.beginTransaction).toHaveBeenCalledTimes(1);
        expect(conn.commit).toHaveBeenCalledTimes(1);
        expect(conn.rollback).not.toHaveBeenCalled();
        expect(conn.release).toHaveBeenCalledTimes(1);
        expect(result.message).toMatch(/inventario/i);
    });

    it('si falla una línea a mitad, se revierte TODO: no se marca recibida y no hay commit', async () => {
        InventarioService.registrarEntrada
            .mockResolvedValueOnce({ nuevoStock: 1 })
            .mockRejectedValueOnce(new Error('Insumo no encontrado'));

        await expect(
            OrdenCompraService.recibir(1, 1, [
                { id: 100, cantidad_recibida: 8 },
                { id: 101, cantidad_recibida: 3 }
            ])
        ).rejects.toThrow('Insumo no encontrado');

        expect(OrdenCompraRepository.marcarRecibida).not.toHaveBeenCalled();
        expect(conn.commit).not.toHaveBeenCalled();
        expect(conn.rollback).toHaveBeenCalledTimes(1);
        expect(conn.release).toHaveBeenCalledTimes(1);
    });
});

describe('OrdenCompraService.cancelar', () => {
    beforeEach(() => jest.clearAllMocks());

    it('rechaza si no se pudo cancelar (no existe o ya no está pendiente)', async () => {
        OrdenCompraRepository.cancelar.mockResolvedValue(0);
        await expect(OrdenCompraService.cancelar(1, 1)).rejects.toThrow('no existe o ya fue recibida');
    });

    it('cancela correctamente', async () => {
        OrdenCompraRepository.cancelar.mockResolvedValue(1);
        const result = await OrdenCompraService.cancelar(1, 1);
        expect(result.message).toMatch(/cancelada/i);
    });
});
