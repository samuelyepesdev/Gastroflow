/**
 * FacturaRepository.createWithDetails con abonos: los abonos de la orden guardada del POS se leen del
 * pedido (nunca del cliente), reducen lo que falta por cobrar y se suman al desglose de la factura.
 */
jest.mock('../../../config/database', () => ({ query: jest.fn(), getConnection: jest.fn() }));
jest.mock('../../../repositories/Tenant/NumeracionRepository', () => ({
    siguienteNumeroFactura: jest.fn().mockResolvedValue(7)
}));
jest.mock('../../../repositories/Tenant/PedidoAbonoRepository', () => ({
    sumByPedido: jest.fn(),
    marcarFacturados: jest.fn()
}));
jest.mock('../../../services/Tenant/BonoService', () => ({ validarParaRedimir: jest.fn().mockResolvedValue(null) }));
jest.mock('../../../repositories/Tenant/BonoRepository', () => ({ redimir: jest.fn() }));
jest.mock('../../../services/Shared/TaxService', () => ({
    getTasasPorProducto: jest.fn().mockResolvedValue({ tasas: new Map(), defaultTasa: 0 }),
    desglosarLinea: jest.fn(subtotal => ({ base_gravable: subtotal, valor_impuesto: 0 }))
}));
jest.mock('../../../repositories/Tenant/ComboVentaRepository', () => ({
    getInfoCombos: jest.fn().mockResolvedValue(new Map()),
    guardarSeleccionesDetalle: jest.fn()
}));
jest.mock('../../../repositories/Tenant/CajaRepository', () => ({ registrarSalidaServicioExterno: jest.fn() }));
jest.mock('../../../services/Shared/RealtimeEvents', () => ({ emitVentaRegistrada: jest.fn() }));

const db = require('../../../config/database');
const PedidoAbonoRepository = require('../../../repositories/Tenant/PedidoAbonoRepository');
const BonoService = require('../../../services/Tenant/BonoService');
const FacturaRepository = require('../../../repositories/Tenant/FacturaRepository');

let conn;
let esOrdenPOS;

const venta = extra => ({
    cliente_id: 1,
    total: 50000,
    forma_pago: 'efectivo',
    productos: [{ producto_id: 3, cantidad: 1, precio: 50000, subtotal: 50000 }],
    pedido_abono_id: 40,
    ...extra
});

const insertFactura = () => conn.query.mock.calls.find(c => /INSERT INTO facturas/.test(c[0]));

beforeEach(() => {
    jest.clearAllMocks();
    BonoService.validarParaRedimir.mockResolvedValue(null);
    esOrdenPOS = true;
    conn = {
        beginTransaction: jest.fn(),
        commit: jest.fn(),
        rollback: jest.fn(),
        release: jest.fn(),
        query: jest.fn(async sql => {
            if (/INSERT INTO facturas/.test(sql)) {
                return [{ insertId: 99 }];
            }
            if (/INSERT INTO detalle_factura \(/.test(sql)) {
                return [{ insertId: 1 }];
            }
            if (/FROM pos_borradores/.test(sql)) {
                return [esOrdenPOS ? [{ 1: 1 }] : []];
            }
            return [[]];
        })
    };
    db.getConnection.mockResolvedValue(conn);
});

describe('FacturaRepository.createWithDetails con abonos del POS', () => {
    it('suma los abonos al desglose y deja la factura como mixta', async () => {
        PedidoAbonoRepository.sumByPedido.mockResolvedValue({ efectivo: 0, transferencia: 20000 });

        await FacturaRepository.createWithDetails(1, venta({ forma_pago: 'efectivo' }));

        const valores = insertFactura()[1];
        // [tenant, numero, cliente, total, forma_pago, evento, aparte, fecha, caja, efectivo, transf, recibido, bono]
        expect(valores[4]).toBe('mixto');
        expect(valores[9]).toBe(30000); // el resto se cobra en efectivo
        expect(valores[10]).toBe(20000); // lo abonado por transferencia
        expect(valores[12]).toBe(0);
        expect(PedidoAbonoRepository.marcarFacturados).toHaveBeenCalledWith(40, 99, conn);
        expect(conn.commit).toHaveBeenCalled();
    });

    it('si el resto se cobra con el mismo método del abono, la factura es de ese método', async () => {
        PedidoAbonoRepository.sumByPedido.mockResolvedValue({ efectivo: 20000, transferencia: 0 });

        await FacturaRepository.createWithDetails(1, venta({ forma_pago: 'efectivo' }));

        const valores = insertFactura()[1];
        expect(valores[4]).toBe('efectivo');
        expect(valores[9]).toBe(50000);
        expect(valores[10]).toBe(0);
    });

    it('abonos que cubren todo: no pide otro pago y queda con el método del abono', async () => {
        PedidoAbonoRepository.sumByPedido.mockResolvedValue({ efectivo: 0, transferencia: 50000 });

        await FacturaRepository.createWithDetails(1, venta({ forma_pago: 'efectivo' }));

        const valores = insertFactura()[1];
        expect(valores[4]).toBe('transferencia');
        expect(valores[9]).toBe(0);
        expect(valores[10]).toBe(50000);
    });

    it('el bono se aplica sobre lo que falta tras los abonos', async () => {
        PedidoAbonoRepository.sumByPedido.mockResolvedValue({ efectivo: 20000, transferencia: 0 });
        BonoService.validarParaRedimir.mockResolvedValue({ id: 5, saldo_actual: 100000 });

        await FacturaRepository.createWithDetails(1, venta({ forma_pago: 'efectivo', codigo_bono: 'ABC' }));

        const valores = insertFactura()[1];
        expect(valores[12]).toBe(30000); // el bono solo cubre el restante, no el total
        expect(valores[9]).toBe(20000); // efectivo = solo el abono
        expect(valores[4]).toBe('mixto');
    });

    it('rechaza (400) y hace rollback si los abonos superan el total de la venta', async () => {
        PedidoAbonoRepository.sumByPedido.mockResolvedValue({ efectivo: 60000, transferencia: 0 });

        await expect(FacturaRepository.createWithDetails(1, venta())).rejects.toMatchObject({
            status: 400,
            message: expect.stringMatching(/superan el total/)
        });
        expect(conn.rollback).toHaveBeenCalled();
        expect(insertFactura()).toBeUndefined();
    });

    it('ignora el pedido si no es una orden guardada del POS de este restaurante', async () => {
        esOrdenPOS = false;
        PedidoAbonoRepository.sumByPedido.mockResolvedValue({ efectivo: 20000, transferencia: 0 });

        await FacturaRepository.createWithDetails(1, venta());

        expect(PedidoAbonoRepository.sumByPedido).not.toHaveBeenCalled();
        expect(PedidoAbonoRepository.marcarFacturados).not.toHaveBeenCalled();
        const valores = insertFactura()[1];
        expect(valores[4]).toBe('efectivo');
        expect(valores[9]).toBe(50000);
    });

    it('sin pedido de la orden se factura como siempre', async () => {
        await FacturaRepository.createWithDetails(1, venta({ pedido_abono_id: null }));

        expect(PedidoAbonoRepository.sumByPedido).not.toHaveBeenCalled();
        expect(insertFactura()[1][4]).toBe('efectivo');
    });
});
