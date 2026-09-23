jest.mock('../../../config/database', () => ({ query: jest.fn() }));
jest.mock('../../../services/Tenant/InventarioService', () => ({
    checkStockParaProducto: jest.fn().mockResolvedValue({ ok: true })
}));
jest.mock('../../../services/Tenant/ModificadorService', () => ({
    validarYCalcularSeleccion: jest.fn().mockResolvedValue({
        precioAdicionalTotal: 0,
        lineasSnapshot: [],
        modificadoresHash: null
    })
}));
jest.mock('../../../services/Tenant/Mesas/SincronizarPrecioPromoService');

const db = require('../../../config/database');
const SincronizarPrecioPromoService = require('../../../services/Tenant/Mesas/SincronizarPrecioPromoService');
const AgregarItemService = require('../../../services/Tenant/Mesas/AgregarItemService');

describe('AgregarItemService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('inserta una fila nueva si no hay ninguna igual todavía pendiente, y sincroniza el precio', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 10, mesa_id: 1 }]]) // SELECT pedidos
            .mockResolvedValueOnce([[]]) // SELECT existentes -> ninguna
            .mockResolvedValueOnce([{ insertId: 55 }]) // INSERT pedido_items
            .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE mesas -> ocupada

        const result = await AgregarItemService.execute({
            tenantId: 1,
            pedidoId: 10,
            producto_id: 7,
            cantidad: 1,
            unidad: 'UND',
            precio: 10000
        });

        expect(result).toEqual({ id: 55 });
        expect(SincronizarPrecioPromoService.ejecutar).toHaveBeenCalledWith(1, 10, 7);
    });

    it('fusiona con una fila pendiente del mismo producto (misma nota, mismos toppings) en vez de crear otra', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 10, mesa_id: 1 }]]) // SELECT pedidos
            .mockResolvedValueOnce([[{ id: 8, cantidad: '1.00' }]]) // SELECT existentes -> ya hay una fila pendiente
            .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE pedido_items SET cantidad
            .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE mesas -> ocupada

        const result = await AgregarItemService.execute({
            tenantId: 1,
            pedidoId: 10,
            producto_id: 7,
            cantidad: 1,
            precio: 10000
        });

        expect(result).toEqual({ id: 8 }); // devuelve el id de la fila existente, no crea una nueva
        const updateCall = db.query.mock.calls.find(
            call => typeof call[0] === 'string' && call[0].startsWith('UPDATE pedido_items')
        );
        expect(updateCall[1]).toEqual([2, 8]); // 1 (ya tenía) + 1 (nueva) = 2
        expect(SincronizarPrecioPromoService.ejecutar).toHaveBeenCalledWith(1, 10, 7);
    });

    it('busca la fila a fusionar filtrando por estado pendiente, nota y toppings (no cualquier fila del producto)', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 10, mesa_id: 1 }]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([{ insertId: 55 }])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        await AgregarItemService.execute({
            tenantId: 1,
            pedidoId: 10,
            producto_id: 7,
            cantidad: 1,
            precio: 10000,
            nota: 'sin cebolla'
        });

        const [existentesQuery, existentesParams] = db.query.mock.calls[1];
        expect(existentesQuery).toMatch(/estado = 'pendiente'/);
        expect(existentesQuery).toMatch(/modificadores_hash\s*<=>\s*\?/);
        expect(existentesQuery).toMatch(/nota\s*<=>\s*\?/);
        expect(existentesParams).toEqual([10, 7, null, 'sin cebolla']);
    });

    it('rechaza si falta producto_id, cantidad o precio', async () => {
        await expect(
            AgregarItemService.execute({ tenantId: 1, pedidoId: 10, cantidad: 1, precio: 5000 })
        ).rejects.toThrow('producto_id, cantidad y precio son requeridos');
        expect(db.query).not.toHaveBeenCalled();
    });

    it('lanza si el pedido no existe', async () => {
        db.query.mockResolvedValueOnce([[]]); // SELECT pedidos -> vacío
        await expect(
            AgregarItemService.execute({ tenantId: 1, pedidoId: 999, producto_id: 7, cantidad: 1, precio: 5000 })
        ).rejects.toThrow('Pedido no encontrado');
        expect(SincronizarPrecioPromoService.ejecutar).not.toHaveBeenCalled();
    });

    it('sincroniza con el producto REAL (espejo) cuando el id es un insumo virtual (>= 1.000.000)', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 3, codigo: 'CER1', nombre: 'Taza', precio_venta: 8000 }]]) // SELECT insumos
            .mockResolvedValueOnce([[{ id: 42, precio_unidad: 8000 }]]) // SELECT productos existente, ya con el precio al día
            .mockResolvedValueOnce([[{ id: 10, mesa_id: 1 }]]) // SELECT pedidos
            .mockResolvedValueOnce([[]]) // SELECT existentes -> ninguna
            .mockResolvedValueOnce([{ insertId: 60 }]) // INSERT pedido_items
            .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE mesas

        await AgregarItemService.execute({
            tenantId: 1,
            pedidoId: 10,
            producto_id: 1000003, // insumo virtual (1000000 + 3)
            cantidad: 1,
            precio: 8000
        });

        // La promo se resuelve sobre el producto espejo real (42), no sobre el id virtual.
        expect(SincronizarPrecioPromoService.ejecutar).toHaveBeenCalledWith(1, 10, 42);
        // El precio ya estaba al día -- no debe haber ningún UPDATE de productos.
        expect(db.query.mock.calls.some(call => String(call[0]).startsWith('UPDATE productos'))).toBe(false);
    });

    it('re-sincroniza el precio del producto espejo si quedó desactualizado frente al insumo (incidente 2026-09-22)', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 3, codigo: 'CER1', nombre: 'Ardilla mochila', precio_venta: 16000 }]]) // SELECT insumos, precio actual
            .mockResolvedValueOnce([[{ id: 42, precio_unidad: 15000 }]]) // SELECT productos existente, precio VIEJO
            .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE productos SET precio_unidad -- la resincronización
            .mockResolvedValueOnce([[{ id: 10, mesa_id: 1 }]]) // SELECT pedidos
            .mockResolvedValueOnce([[]]) // SELECT existentes -> ninguna
            .mockResolvedValueOnce([{ insertId: 61 }]) // INSERT pedido_items
            .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE mesas

        await AgregarItemService.execute({
            tenantId: 1,
            pedidoId: 10,
            producto_id: 1000003,
            cantidad: 1,
            precio: 16000
        });

        const updateCall = db.query.mock.calls.find(call => String(call[0]).startsWith('UPDATE productos'));
        expect(updateCall[1]).toEqual([16000, 42]);
        expect(SincronizarPrecioPromoService.ejecutar).toHaveBeenCalledWith(1, 10, 42);
    });
});
