const FacturarPedidoService = require('../../../services/Tenant/Mesas/FacturarPedidoService');
const db = require('../../../config/database');
const FacturaRepository = require('../../../repositories/Tenant/FacturaRepository');
const RealtimeEvents = require('../../../services/Shared/RealtimeEvents');

jest.mock('../../../services/Tenant/TenantOwnership', () => ({
    clientes: jest.fn().mockResolvedValue(),
    productos: jest.fn().mockResolvedValue(),
    servicios: jest.fn().mockResolvedValue(),
    eventos: jest.fn().mockResolvedValue(),
    insumos: jest.fn().mockResolvedValue()
}));
jest.mock('../../../config/database', () => {
    const mockConnection = {
        beginTransaction: jest.fn(),
        commit: jest.fn(),
        rollback: jest.fn(),
        release: jest.fn(),
        query: jest.fn()
    };
    return {
        getConnection: jest.fn().mockResolvedValue(mockConnection),
        query: jest.fn()
    };
});

jest.mock('../../../repositories/Tenant/FacturaRepository', () => ({
    acomodarNumeracionSiFalta: jest.fn(),
    createWithDetails: jest.fn().mockResolvedValue({ insertId: 100 }),
    obtenerSiguienteNumero: jest.fn().mockResolvedValue(123)
}));

jest.mock('../../../services/Tenant/InventarioService', () => ({
    descontarStockReceta: jest.fn().mockResolvedValue(undefined),
    descontarProductosLote: jest.fn().mockResolvedValue(undefined),
    descontarPorCombosFactura: jest.fn().mockResolvedValue(undefined),
    descontarPorModificadoresFactura: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../../../services/Tenant/FinanzasService', () => ({
    registrarIngresoVenta: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../../../services/Shared/CacheService', () => ({
    deleteByPrefix: jest.fn(),
    delete: jest.fn()
}));

jest.mock('../../../services/Shared/RealtimeEvents', () => ({
    emit: jest.fn(),
    emitPedido: jest.fn(),
    emitVentaRegistrada: jest.fn(),
    emitMesasChanged: jest.fn(),
    on: jest.fn(),
    removeListener: jest.fn(),
    setMaxListeners: jest.fn()
}));

describe('FacturarPedidoService', () => {
    let mockConn;

    beforeEach(() => {
        jest.clearAllMocks();
        mockConn = {
            beginTransaction: jest.fn(),
            commit: jest.fn(),
            rollback: jest.fn(),
            release: jest.fn(),
            query: jest.fn()
        };
        db.getConnection.mockResolvedValue(mockConn);
    });

    describe('permiso de descuento manual', () => {
        const base = { tenantId: 1, pedidoId: 10, cliente_id: 1, forma_pago: 'efectivo', propinaBody: 0 };

        it.each([[{ 5: 10 }], [{ 5: { tipo: 'porcentaje', valor: 15 } }], [{ 5: { tipo: 'valor', valor: 2000 } }]])(
            'sin permiso rechaza con 403 el descuento %j y no abre transacción',
            async descuentosMap => {
                await expect(FacturarPedidoService.execute({ ...base, descuentosMap })).rejects.toMatchObject({
                    status: 403,
                    codigo: 'DESCUENTO_NO_AUTORIZADO'
                });
                expect(db.getConnection).not.toHaveBeenCalled();
            }
        );

        it('sin permiso, descuentos en 0 o vacíos no bloquean', async () => {
            mockConn.query.mockResolvedValueOnce([[]]); // pedido no existe: llegó a la transacción
            await expect(
                FacturarPedidoService.execute({ ...base, descuentosMap: { 5: 0, 6: { tipo: 'valor', valor: 0 } } })
            ).rejects.toThrow('Pedido no encontrado');
        });

        it('con permiso el descuento sigue su curso normal', async () => {
            mockConn.query.mockResolvedValueOnce([[]]);
            await expect(
                FacturarPedidoService.execute({ ...base, descuentosMap: { 5: 10 }, puedeAplicarDescuento: true })
            ).rejects.toThrow('Pedido no encontrado');
        });
    });

    it('lanza "Pedido no encontrado" si el pedido no existe', async () => {
        mockConn.query.mockResolvedValueOnce([[]]); // SELECT pedidos

        await expect(
            FacturarPedidoService.execute({
                tenantId: 1,
                pedidoId: 10,
                cliente_id: 1,
                forma_pago: 'efectivo',
                descuentosMap: {},
                propinaBody: 0
            })
        ).rejects.toThrow('Pedido no encontrado');

        expect(mockConn.rollback).toHaveBeenCalled();
        expect(mockConn.release).toHaveBeenCalled();
    });

    it('lanza error si el pedido ya está cerrado', async () => {
        mockConn.query.mockResolvedValueOnce([[{ id: 10, estado: 'cerrado', mesa_id: 2 }]]); // SELECT pedidos

        await expect(
            FacturarPedidoService.execute({
                tenantId: 1,
                pedidoId: 10,
                cliente_id: 1,
                forma_pago: 'efectivo',
                descuentosMap: {},
                propinaBody: 0
            })
        ).rejects.toThrow('El pedido ya ha sido cerrado y facturado');

        expect(mockConn.rollback).toHaveBeenCalled();
        expect(mockConn.release).toHaveBeenCalled();
    });

    it('lanza error si el pedido ya está cancelado', async () => {
        mockConn.query.mockResolvedValueOnce([[{ id: 10, estado: 'cancelado', mesa_id: 2 }]]); // SELECT pedidos

        await expect(
            FacturarPedidoService.execute({
                tenantId: 1,
                pedidoId: 10,
                cliente_id: 1,
                forma_pago: 'efectivo',
                descuentosMap: {},
                propinaBody: 0
            })
        ).rejects.toThrow('El pedido ha sido cancelado');

        expect(mockConn.rollback).toHaveBeenCalled();
        expect(mockConn.release).toHaveBeenCalled();
    });

    it('lanza "Pedido sin items" si no tiene items', async () => {
        mockConn.query
            .mockResolvedValueOnce([[{ id: 10, estado: 'abierto', mesa_id: 2 }]]) // SELECT pedidos
            .mockResolvedValueOnce([[]]); // SELECT items

        await expect(
            FacturarPedidoService.execute({
                tenantId: 1,
                pedidoId: 10,
                cliente_id: 1,
                forma_pago: 'efectivo',
                descuentosMap: {},
                propinaBody: 0
            })
        ).rejects.toThrow('Pedido sin items');
    });

    describe('_procesarLineasFactura (descuentos por línea)', () => {
        const tasas = new Map();
        const item = (over = {}) => ({
            id: 1,
            producto_id: 7,
            es_servicio: 0,
            cantidad: 2,
            precio_unitario: 5000,
            pagado: 0,
            unidad_medida: 'UND',
            ...over
        });

        it('descuento en % (número suelto, retrocompat)', () => {
            const { total, lineasFactura } = FacturarPedidoService._procesarLineasFactura(
                [item()],
                { 1: 10 },
                tasas,
                0
            );
            expect(total).toBe(9000);
            expect(lineasFactura[0].descuento_porcentaje).toBe(10);
            expect(lineasFactura[0].descuento_valor).toBeNull();
        });

        it('descuento en $ ({ tipo: "valor" }) resta del total de la línea', () => {
            const { total, lineasFactura } = FacturarPedidoService._procesarLineasFactura(
                [item()],
                { 1: { tipo: 'valor', valor: 3000 } },
                tasas,
                0
            );
            expect(total).toBe(7000);
            expect(lineasFactura[0].descuento_valor).toBe(3000);
            expect(lineasFactura[0].descuento_porcentaje).toBeNull();
            expect(lineasFactura[0].precio_unitario).toBe(3500);
        });

        it('descuento en $ mayor que el bruto se recorta al bruto', () => {
            const { total, lineasFactura } = FacturarPedidoService._procesarLineasFactura(
                [item()],
                { 1: { tipo: 'valor', valor: 999999 } },
                tasas,
                0
            );
            expect(total).toBe(0);
            expect(lineasFactura[0].descuento_valor).toBe(10000);
        });

        it('sin descuento deja ambas columnas en null', () => {
            const { lineasFactura } = FacturarPedidoService._procesarLineasFactura([item()], {}, tasas, 0);
            expect(lineasFactura[0].descuento_porcentaje).toBeNull();
            expect(lineasFactura[0].descuento_valor).toBeNull();
        });

        it('un ítem ya pagado por producto va a montoEfectivo/montoTransferencia, no a montoPendiente', () => {
            const res = FacturarPedidoService._procesarLineasFactura(
                [item({ pagado: 1, forma_pago: 'transferencia' })],
                {},
                tasas,
                0
            );
            expect(res.montoTransferencia).toBe(10000);
            expect(res.montoEfectivo).toBe(0);
            expect(res.montoPendiente).toBe(0);
        });

        it('un ítem sin pagar va a montoPendiente (lo cubren abonos o la forma de pago del cierre)', () => {
            const res = FacturarPedidoService._procesarLineasFactura([item()], {}, tasas, 0);
            expect(res.montoPendiente).toBe(10000);
            expect(res.montoEfectivo).toBe(0);
            expect(res.montoTransferencia).toBe(0);
        });
    });

    describe('_procesarLineasFactura (servicios externos → salida de caja)', () => {
        const tasas = new Map();
        const producto = { id: 1, producto_id: 7, es_servicio: 0, cantidad: 1, precio_unitario: 30000, pagado: 0 };
        const domicilioExterno = {
            id: 2,
            servicio_id: 99,
            es_servicio: 1,
            cantidad: 1,
            precio_unitario: 6000,
            pagado: 0
        };

        it('acumula el servicio externo en montoServiciosExternos sin importar cómo se pague', () => {
            const res = FacturarPedidoService._procesarLineasFactura(
                [producto, domicilioExterno],
                {},
                tasas,
                0,
                new Set([99])
            );
            expect(res.montoServiciosExternos).toBe(6000);
            // al domiciliario se le paga en efectivo de la gaveta -> se compensa aparte con la salida,
            // sin importar la forma de pago elegida al facturar (eso ya no lo decide esta función).
            expect(res.montoPendiente).toBe(36000);
        });

        it('NO acumula si el servicio no es externo', () => {
            const res = FacturarPedidoService._procesarLineasFactura(
                [producto, domicilioExterno],
                {},
                tasas,
                0,
                new Set() // 99 no está marcado como externo
            );
            expect(res.montoServiciosExternos).toBe(0);
        });
    });

    describe('_calcularTotalesYFormaPago (abonos libres + pago del cierre)', () => {
        it('sin abonos: todo lo pendiente va a la forma de pago del cierre', () => {
            const res = FacturarPedidoService._calcularTotalesYFormaPago(
                30000,
                0,
                0,
                30000,
                { efectivo: 0, transferencia: 0 },
                0,
                'efectivo'
            );
            expect(res.montoEfectivo).toBe(30000);
            expect(res.montoTransferencia).toBe(0);
            expect(res.formaPagoFinal).toBe('efectivo');
        });

        it('abono parcial en efectivo + resto en transferencia al cerrar => factura mixta', () => {
            const res = FacturarPedidoService._calcularTotalesYFormaPago(
                30000,
                0,
                0,
                30000,
                { efectivo: 15000, transferencia: 0 },
                0,
                'transferencia'
            );
            expect(res.montoEfectivo).toBe(15000);
            expect(res.montoTransferencia).toBe(15000);
            expect(res.formaPagoFinal).toBe('mixto');
            expect(res.montoEfectivo + res.montoTransferencia).toBe(res.totalConPropina);
        });

        it('abonos cubren el total exacto: no se le suma nada a la forma de pago del cierre', () => {
            const res = FacturarPedidoService._calcularTotalesYFormaPago(
                30000,
                0,
                0,
                30000,
                { efectivo: 15000, transferencia: 15000 },
                0,
                'efectivo'
            );
            expect(res.montoEfectivo).toBe(15000);
            expect(res.montoTransferencia).toBe(15000);
            expect(res.formaPagoFinal).toBe('mixto');
        });

        it('la propina nunca se cubre con abonos, siempre va a la forma de pago del cierre', () => {
            const res = FacturarPedidoService._calcularTotalesYFormaPago(
                30000,
                0,
                0,
                30000,
                { efectivo: 30000, transferencia: 0 },
                2000,
                'transferencia'
            );
            expect(res.montoEfectivo).toBe(30000);
            expect(res.montoTransferencia).toBe(2000);
            expect(res.totalConPropina).toBe(32000);
        });

        it('bono con saldo suficiente cubre todo lo pendiente: forma_pago final es "bono"', () => {
            const res = FacturarPedidoService._calcularTotalesYFormaPago(
                30000,
                0,
                0,
                30000,
                { efectivo: 0, transferencia: 0 },
                0,
                'efectivo',
                50000 // saldo del bono
            );
            expect(res.montoBono).toBe(30000);
            expect(res.montoEfectivo).toBe(0);
            expect(res.montoTransferencia).toBe(0);
            expect(res.formaPagoFinal).toBe('bono');
        });

        it('bono nunca redime más de su propio saldo: el resto va a la forma de pago del cierre', () => {
            const res = FacturarPedidoService._calcularTotalesYFormaPago(
                30000,
                0,
                0,
                30000,
                { efectivo: 0, transferencia: 0 },
                0,
                'transferencia',
                12000 // saldo del bono, menor al pendiente
            );
            expect(res.montoBono).toBe(12000);
            expect(res.montoTransferencia).toBe(18000);
            expect(res.montoEfectivo).toBe(0);
            expect(res.formaPagoFinal).toBe('mixto');
            expect(res.montoBono + res.montoTransferencia).toBe(res.totalConPropina);
        });

        it('bono + abono + pago del cierre combinados: se reparte en orden y queda "mixto"', () => {
            const res = FacturarPedidoService._calcularTotalesYFormaPago(
                30000,
                0,
                0,
                30000,
                { efectivo: 10000, transferencia: 0 }, // abono ya cubrió 10.000
                0,
                'transferencia',
                15000 // el bono cubre otros 15.000 de lo que quedó pendiente
            );
            expect(res.montoEfectivo).toBe(10000); // el abono, intacto
            expect(res.montoBono).toBe(15000);
            expect(res.montoTransferencia).toBe(5000); // el resto, con la forma de pago del cierre
            expect(res.formaPagoFinal).toBe('mixto');
            expect(res.montoEfectivo + res.montoBono + res.montoTransferencia).toBe(res.totalConPropina);
        });

        it('sin bono (montoBonoDisponible por defecto 0): mismo comportamiento de siempre', () => {
            const res = FacturarPedidoService._calcularTotalesYFormaPago(
                30000,
                0,
                0,
                30000,
                { efectivo: 0, transferencia: 0 },
                0,
                'efectivo'
            );
            expect(res.montoBono).toBe(0);
            expect(res.montoEfectivo).toBe(30000);
            expect(res.formaPagoFinal).toBe('efectivo');
        });
    });

    it('factura correctamente y emite el evento SSE "billed"', async () => {
        mockConn.query
            .mockResolvedValueOnce([[{ id: 10, estado: 'abierto', mesa_id: 2, total: 5000 }]]) // SELECT pedidos
            .mockResolvedValueOnce([[{ id: 1, cantidad: 1, precio_unitario: 5000, pagado: 0 }]]); // SELECT items

        // Simular queries internas de facturación. La consulta de modificadores del
        // pedido (_copiarModificadores) hace `const [rows] = await connection.query(...)`
        // y espera un array para poder hacer .filter() sobre él -- el catch-all genérico
        // de INSERT ({ insertId: 100 }) no sirve para esa, así que se distingue por SQL.
        mockConn.query.mockImplementation(sql => {
            if (typeof sql === 'string' && sql.includes('pedido_item_modificadores')) {
                return Promise.resolve([[]]); // sin modificadores en este pedido de prueba
            }
            if (typeof sql === 'string' && sql.includes('pedido_abonos')) {
                return Promise.resolve([[]]); // sin abonos libres registrados en este pedido de prueba
            }
            return Promise.resolve([{ insertId: 100 }]); // INSERT factura, detalle_factura, etc.
        });

        const res = await FacturarPedidoService.execute({
            tenantId: 1,
            pedidoId: 10,
            cliente_id: 1,
            forma_pago: 'efectivo',
            descuentosMap: {},
            propinaBody: 0
        });

        expect(res).toHaveProperty('factura_id');
        expect(mockConn.commit).toHaveBeenCalled();
        expect(mockConn.release).toHaveBeenCalled();

        // Verificar que se emitió el evento SSE
        expect(RealtimeEvents.emitPedido).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 1,
                pedidoId: 10,
                mesaId: 2,
                action: 'billed'
            })
        );
    });

    describe('finanzas e inventario dentro de la transacción de la factura', () => {
        const InventarioService = require('../../../services/Tenant/InventarioService');
        const FinanzasService = require('../../../services/Tenant/FinanzasService');

        const prepararMesa = () => {
            mockConn.query
                .mockResolvedValueOnce([[{ id: 10, estado: 'abierto', mesa_id: 2, total: 5000 }]]) // SELECT pedidos
                .mockResolvedValueOnce([
                    [{ id: 1, producto_id: 7, cantidad: 2, precio_unitario: 2500, pagado: 0, es_servicio: 0 }]
                ]); // SELECT items
            mockConn.query.mockImplementation(sql => {
                if (typeof sql === 'string' && sql.includes('pedido_item_modificadores')) {
                    return Promise.resolve([[]]);
                }
                if (typeof sql === 'string' && sql.includes('pedido_abonos')) {
                    return Promise.resolve([[]]);
                }
                if (typeof sql === 'string' && /FROM (productos|tenants)/.test(sql)) {
                    return Promise.resolve([[]]); // tasas de impuesto: sin filas
                }
                return Promise.resolve([{ insertId: 100 }]);
            });
        };
        const facturar = () =>
            FacturarPedidoService.execute({
                tenantId: 1,
                pedidoId: 10,
                cliente_id: 1,
                forma_pago: 'efectivo',
                descuentosMap: {},
                propinaBody: 0
            });

        it('el ingreso y el descuento se hacen con la conexión de la venta y ANTES del commit', async () => {
            prepararMesa();
            const orden = [];
            mockConn.commit.mockImplementation(async () => orden.push('commit'));
            FinanzasService.registrarIngresoVenta.mockImplementation(async () => orden.push('finanzas'));
            InventarioService.descontarProductosLote.mockImplementation(async () => orden.push('inventario'));

            await facturar();

            expect(FinanzasService.registrarIngresoVenta).toHaveBeenCalledWith(
                1,
                expect.objectContaining({ factura_id: 100, conn: mockConn })
            );
            expect(InventarioService.descontarProductosLote).toHaveBeenCalledWith(
                1,
                [expect.objectContaining({ producto_id: 7, cantidad: 2 })],
                'factura_100',
                mockConn
            );
            expect(InventarioService.descontarPorModificadoresFactura).toHaveBeenCalledWith(1, 100, mockConn);
            expect(orden).toEqual(['finanzas', 'inventario', 'commit']);
        });

        it('si falla el ingreso en finanzas se revierte la venta: rollback, sin commit y sin evento billed', async () => {
            prepararMesa();
            FinanzasService.registrarIngresoVenta.mockRejectedValueOnce(new Error('finanzas caída'));

            await expect(facturar()).rejects.toThrow('finanzas caída');

            expect(mockConn.rollback).toHaveBeenCalled();
            expect(mockConn.commit).not.toHaveBeenCalled();
            expect(mockConn.release).toHaveBeenCalled();
            expect(RealtimeEvents.emitPedido).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'billed' }));
        });

        it('si falla el descuento de inventario también se revierte la venta', async () => {
            prepararMesa();
            InventarioService.descontarProductosLote.mockRejectedValueOnce(new Error('insumos caída'));

            await expect(facturar()).rejects.toThrow('insumos caída');

            expect(mockConn.rollback).toHaveBeenCalled();
            expect(mockConn.commit).not.toHaveBeenCalled();
        });
    });

    describe('redención de bono al facturar', () => {
        it('redime el bono, lo descuenta de lo pendiente y registra el movimiento', async () => {
            const bonoRow = {
                id: 55,
                tenant_id: 1,
                codigo: 'BONO-ABC123',
                saldo_actual: 3000,
                estado: 'activo',
                fecha_vencimiento: null
            };

            mockConn.query
                .mockResolvedValueOnce([[{ id: 10, estado: 'abierto', mesa_id: 2, total: 5000 }]]) // SELECT pedidos
                .mockResolvedValueOnce([[{ id: 1, cantidad: 1, precio_unitario: 5000, pagado: 0 }]]); // SELECT items

            mockConn.query.mockImplementation(sql => {
                if (typeof sql === 'string' && sql.includes('pedido_item_modificadores')) {
                    return Promise.resolve([[]]);
                }
                if (typeof sql === 'string' && sql.includes('pedido_abonos')) {
                    return Promise.resolve([[]]);
                }
                if (typeof sql === 'string' && sql.includes('FROM bonos WHERE codigo')) {
                    return Promise.resolve([[bonoRow]]);
                }
                if (typeof sql === 'string' && sql.startsWith('UPDATE bonos')) {
                    return Promise.resolve([{ affectedRows: 1 }]);
                }
                if (typeof sql === 'string' && sql.includes('INSERT INTO bono_movimientos')) {
                    return Promise.resolve([{ insertId: 1 }]);
                }
                return Promise.resolve([{ insertId: 100 }]);
            });

            const res = await FacturarPedidoService.execute({
                tenantId: 1,
                pedidoId: 10,
                cliente_id: 1,
                forma_pago: 'efectivo',
                descuentosMap: {},
                propinaBody: 0,
                codigoBono: 'bono-abc123' // el service lo normaliza a mayúsculas
            });

            expect(res).toHaveProperty('factura_id');
            expect(mockConn.commit).toHaveBeenCalled();

            // El total del pedido es 5.000 y el bono solo tiene 3.000 de saldo:
            // la factura queda INSERT con monto_bono=3000 y monto_efectivo=2000 (el resto).
            const insertFactura = mockConn.query.mock.calls.find(
                call => typeof call[0] === 'string' && call[0].includes('INSERT INTO facturas')
            );
            expect(insertFactura).toBeDefined();
            const [, values] = insertFactura;
            const montoEfectivoIdx = 5; // orden de columnas en el INSERT: ...forma_pago, monto_efectivo, monto_transferencia, efectivo_recibido, monto_bono...
            const montoBonoIdx = 8;
            expect(values[montoEfectivoIdx]).toBe(2000);
            expect(values[montoBonoIdx]).toBe(3000);

            const updateBono = mockConn.query.mock.calls.find(
                call => typeof call[0] === 'string' && call[0].startsWith('UPDATE bonos')
            );
            expect(updateBono[1]).toEqual([0, 'agotado', 55, 1]); // saldo 3000 - 3000 redimido = 0, queda 'agotado'
        });

        it('rechaza facturar si el código de bono no existe (no crea la factura)', async () => {
            mockConn.query
                .mockResolvedValueOnce([[{ id: 10, estado: 'abierto', mesa_id: 2, total: 5000 }]])
                .mockResolvedValueOnce([[{ id: 1, cantidad: 1, precio_unitario: 5000, pagado: 0 }]]);

            mockConn.query.mockImplementation(sql => {
                if (typeof sql === 'string' && sql.includes('pedido_abonos')) {
                    return Promise.resolve([[]]);
                }
                if (typeof sql === 'string' && sql.includes('FROM bonos WHERE codigo')) {
                    return Promise.resolve([[]]); // no existe
                }
                return Promise.resolve([{ insertId: 100 }]);
            });

            await expect(
                FacturarPedidoService.execute({
                    tenantId: 1,
                    pedidoId: 10,
                    cliente_id: 1,
                    forma_pago: 'efectivo',
                    descuentosMap: {},
                    propinaBody: 0,
                    codigoBono: 'BONO-NOEXISTE'
                })
            ).rejects.toThrow('El código de bono no existe');

            expect(mockConn.rollback).toHaveBeenCalled();
            const insertFactura = mockConn.query.mock.calls.find(
                call => typeof call[0] === 'string' && call[0].includes('INSERT INTO facturas')
            );
            expect(insertFactura).toBeUndefined();
        });
    });
});
