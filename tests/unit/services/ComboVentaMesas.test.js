/**
 * Venta de combos armados en Mesas: agregar al pedido, impuesto al facturar,
 * descuento de inventario por selección y copia del snapshot a la factura.
 * BD y repositorios mockeados.
 */

jest.mock('../../../config/database', () => ({ query: jest.fn(), getConnection: jest.fn() }));
jest.mock('../../../services/Tenant/ComboArmableService');
jest.mock('../../../services/Tenant/InventarioService');
jest.mock('../../../repositories/Tenant/ComboVentaRepository');
jest.mock('../../../services/Shared/RealtimeEvents', () => ({ emitPedido: jest.fn() }));

const db = require('../../../config/database');
const ComboArmableService = require('../../../services/Tenant/ComboArmableService');
const InventarioService = require('../../../services/Tenant/InventarioService');
const ComboVentaRepository = require('../../../repositories/Tenant/ComboVentaRepository');
const AgregarComboService = require('../../../services/Tenant/Mesas/AgregarComboService');
const FacturarPedidoService = require('../../../services/Tenant/Mesas/FacturarPedidoService');

const TENANT = 7;
const combo = {
    combo_id: 50,
    precio_final: 22000,
    selecciones: [
        {
            combo_opcion_id: 1,
            producto_id: 10,
            grupo_nombre: 'Plato',
            producto_nombre: 'Burger',
            cantidad: 1,
            recargo: 0
        },
        {
            combo_opcion_id: 2,
            producto_id: 21,
            grupo_nombre: 'Bebida',
            producto_nombre: 'Gaseosa',
            cantidad: 2,
            recargo: 2000
        }
    ]
};

describe('AgregarComboService', () => {
    let connection;

    beforeEach(() => {
        jest.resetAllMocks();
        connection = {
            beginTransaction: jest.fn(),
            commit: jest.fn(),
            rollback: jest.fn(),
            release: jest.fn(),
            query: jest.fn().mockResolvedValue([{ insertId: 77 }])
        };
        db.getConnection.mockResolvedValue(connection);
        db.query.mockResolvedValue([[{ id: 5, mesa_id: 3 }]]);
        ComboArmableService.resolverSeleccion.mockResolvedValue(combo);
        InventarioService.checkStockParaProducto.mockResolvedValue({ ok: true });
        ComboVentaRepository.guardarSeleccionesPedidoItem.mockResolvedValue();
    });

    it('inserta UNA línea con producto NULL, precio del catálogo y guarda el snapshot', async () => {
        const res = await AgregarComboService.execute({
            tenantId: TENANT,
            pedidoId: 5,
            combo_id: 50,
            cantidad: 2,
            selecciones: [{ opcion_id: 2 }],
            precio: 1 // un precio enviado por el cliente se ignora
        });

        expect(res).toEqual({ id: 77, precio_unitario: 22000 });
        const [sql, params] = connection.query.mock.calls[0];
        expect(sql).toMatch(/INSERT INTO pedido_items/);
        expect(sql).toMatch(/producto_id, combo_id/);
        expect(params).toEqual([TENANT, 5, 50, 2, 22000, 44000, null]);
        expect(ComboVentaRepository.guardarSeleccionesPedidoItem).toHaveBeenCalledWith(
            77,
            combo.selecciones,
            connection
        );
        expect(connection.commit).toHaveBeenCalled();
    });

    it('revierte la transacción si falla el snapshot', async () => {
        ComboVentaRepository.guardarSeleccionesPedidoItem.mockRejectedValue(new Error('boom'));

        await expect(
            AgregarComboService.execute({ tenantId: TENANT, pedidoId: 5, combo_id: 50, selecciones: [] })
        ).rejects.toThrow('boom');
        expect(connection.rollback).toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalled();
    });

    it('falla si el pedido no existe, está cerrado o es de otro tenant', async () => {
        db.query.mockResolvedValue([[]]);

        await expect(
            AgregarComboService.execute({ tenantId: TENANT, pedidoId: 5, combo_id: 50, selecciones: [] })
        ).rejects.toThrow('Pedido no encontrado');
        expect(ComboArmableService.resolverSeleccion).not.toHaveBeenCalled();
    });

    it('propaga el error de validación de la selección sin insertar nada', async () => {
        ComboArmableService.resolverSeleccion.mockRejectedValue(new Error('Elige una opción en "Bebida"'));

        await expect(
            AgregarComboService.execute({ tenantId: TENANT, pedidoId: 5, combo_id: 50, selecciones: [] })
        ).rejects.toThrow(/Bebida/);
        expect(connection.query).not.toHaveBeenCalled();
    });

    it('exige combo_id y cantidad > 0', async () => {
        await expect(AgregarComboService.execute({ tenantId: TENANT, pedidoId: 5, cantidad: 1 })).rejects.toThrow(
            /requeridos/
        );
        await expect(
            AgregarComboService.execute({ tenantId: TENANT, pedidoId: 5, combo_id: 50, cantidad: 0 })
        ).rejects.toThrow(/requeridos/);
    });

    it('vender sin stock suficiente no bloquea la venta', async () => {
        InventarioService.checkStockParaProducto.mockResolvedValue({
            ok: false,
            faltantes: [{ insumo_nombre: 'Pan', requerido: 2, unidad_base: 'UND', disponible: 0 }]
        });
        const aviso = jest.spyOn(console, 'warn').mockImplementation(() => {});

        await expect(
            AgregarComboService.execute({ tenantId: TENANT, pedidoId: 5, combo_id: 50, selecciones: [] })
        ).resolves.toMatchObject({ id: 77 });
        expect(aviso).toHaveBeenCalled();
        aviso.mockRestore();
    });
});

describe('FacturarPedidoService con líneas de combo', () => {
    const item = (extra = {}) => ({
        id: 1,
        producto_id: null,
        servicio_id: null,
        es_servicio: 0,
        combo_id: 50,
        cantidad: 2,
        precio_unitario: 22000,
        unidad_medida: 'UND',
        pagado: 0,
        ...extra
    });
    const procesar = (items, tasaCombo, tasas = new Map()) =>
        FacturarPedidoService._procesarLineasFactura(
            items,
            {},
            tasas,
            19,
            new Set(),
            new Map([[50, { nombre: 'Combo', tasa_impuesto: tasaCombo }]])
        );

    it('usa el impuesto propio del combo y lo deja en la línea con su combo_id', () => {
        const { lineasFactura, total } = procesar([item()], 8);

        expect(total).toBe(44000);
        expect(lineasFactura[0]).toMatchObject({ producto_id: null, combo_id: 50, tasa_impuesto: 8 });
    });

    it('un combo con impuesto 0 (exento) no cae al default del restaurante', () => {
        expect(procesar([item()], 0).lineasFactura[0].tasa_impuesto).toBe(0);
    });

    it('sin impuesto propio usa el default del restaurante', () => {
        expect(procesar([item()], null).lineasFactura[0].tasa_impuesto).toBe(19);
    });

    it('las líneas de producto normales no se ven afectadas', () => {
        const { lineasFactura } = procesar([item({ producto_id: 10, combo_id: null })], 8, new Map([[10, 5]]));

        expect(lineasFactura[0]).toMatchObject({ producto_id: 10, combo_id: null, tasa_impuesto: 5 });
    });
});
