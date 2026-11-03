/**
 * Tests unitarios para FacturaService (repository mockeado)
 */

jest.mock('../../../services/Tenant/TenantOwnership', () => ({
    clientes: jest.fn().mockResolvedValue(),
    productos: jest.fn().mockResolvedValue(),
    servicios: jest.fn().mockResolvedValue(),
    eventos: jest.fn().mockResolvedValue(),
    insumos: jest.fn().mockResolvedValue()
}));
jest.mock('../../../repositories/Tenant/FacturaRepository', () => ({
    createWithDetails: jest.fn(),
    findByIdWithClient: jest.fn(),
    getDetailsByFacturaId: jest.fn(),
    getDetailsForAPI: jest.fn()
}));

jest.mock('../../../services/Tenant/InventarioService', () => ({
    checkStockParaProducto: jest.fn().mockResolvedValue({ ok: true }),
    descontarStockPorFactura: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../../../services/Tenant/Mesas/AgregarItemService', () => ({
    _getOrCreateMirrorProduct: jest.fn()
}));

jest.mock('../../../services/Tenant/FinanzasService', () => ({
    registrarVenta: jest.fn().mockResolvedValue(undefined),
    registrarIngresoVenta: jest.fn().mockResolvedValue(1)
}));

jest.mock('../../../repositories/Tenant/EventoRepository', () => ({
    findById: jest.fn()
}));

jest.mock('../../../repositories/Tenant/InsumoRepository', () => ({
    findAll: jest.fn().mockResolvedValue([])
}));

jest.mock('../../../repositories/Tenant/ProductRepository', () => ({
    findById: jest.fn().mockResolvedValue(null)
}));

jest.mock('../../../services/Tenant/ModificadorService', () => ({
    validarYCalcularSeleccion: jest
        .fn()
        .mockResolvedValue({ precioAdicionalTotal: 0, lineasSnapshot: [], modificadoresHash: null })
}));

const FacturaService = require('../../../services/Tenant/FacturaService');
const FacturaRepository = require('../../../repositories/Tenant/FacturaRepository');
const ModificadorService = require('../../../services/Tenant/ModificadorService');
const EventoRepository = require('../../../repositories/Tenant/EventoRepository');
const FinanzasService = require('../../../services/Tenant/FinanzasService');
const { hoyColombia, sumarDias } = require('../../../utils/dateHelpers');

describe('FacturaService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('create', () => {
        const tenantId = 1;
        const facturaValida = {
            cliente_id: 10,
            total: 50000,
            forma_pago: 'efectivo',
            productos: [{ producto_id: 1, cantidad: 2, precio: 10000, unidad: 'UND', subtotal: 20000 }]
        };

        it('valida que cliente, evento, productos y servicios sean del tenant', async () => {
            const TenantOwnership = require('../../../services/Tenant/TenantOwnership');
            FacturaRepository.createWithDetails.mockResolvedValue({ insertId: 1 });
            await FacturaService.create(tenantId, {
                ...facturaValida,
                evento_id: 7,
                productos: [
                    ...facturaValida.productos,
                    { es_servicio: true, servicio_id: 4, cantidad: 1, precio: 5, subtotal: 5 }
                ]
            });
            expect(TenantOwnership.clientes).toHaveBeenCalledWith(tenantId, 10);
            expect(TenantOwnership.eventos).toHaveBeenCalledWith(tenantId, 7);
            expect(TenantOwnership.productos).toHaveBeenCalledWith(tenantId, [1]);
            expect(TenantOwnership.servicios).toHaveBeenCalledWith(tenantId, [4]);
        });

        describe('fecha de la venta de un evento', () => {
            const hoy = hoyColombia();
            const ayer = sumarDias(hoy, -1);
            const evento = { id: 7, activo: 1, fecha_inicio: sumarDias(hoy, -5), fecha_fin: sumarDias(hoy, 5) };

            beforeEach(() => {
                FacturaRepository.createWithDetails.mockResolvedValue({ insertId: 5 });
                EventoRepository.findById.mockResolvedValue(evento);
            });

            it('una venta de evento con otro día pasa ese día al repositorio y a finanzas', async () => {
                await FacturaService.create(tenantId, { ...facturaValida, evento_id: 7, fecha: ayer });
                expect(FacturaRepository.createWithDetails.mock.calls[0][1].fecha_venta).toBe(ayer);
                expect(FinanzasService.registrarIngresoVenta.mock.calls[0][1].fecha).toBe(ayer);
            });

            it('sin fecha, o con la de hoy, vende "ahora" (sin día propio)', async () => {
                await FacturaService.create(tenantId, { ...facturaValida, evento_id: 7 });
                await FacturaService.create(tenantId, { ...facturaValida, evento_id: 7, fecha: hoy });
                expect(FacturaRepository.createWithDetails.mock.calls.map(c => c[1].fecha_venta)).toEqual([null, null]);
            });

            it('rechaza vender en un evento inactivo con error 400', async () => {
                EventoRepository.findById.mockResolvedValue({ ...evento, activo: 0 });
                await expect(FacturaService.create(tenantId, { ...facturaValida, evento_id: 7 })).rejects.toMatchObject(
                    {
                        status: 400,
                        message: expect.stringMatching(/inactivo/)
                    }
                );
                expect(FacturaRepository.createWithDetails).not.toHaveBeenCalled();
            });

            it('pasa el pago mixto (efectivo y transferencia) al repositorio', async () => {
                await FacturaService.create(tenantId, {
                    ...facturaValida,
                    evento_id: 7,
                    forma_pago: 'mixto',
                    monto_efectivo: 20000,
                    monto_transferencia: 30000
                });
                const datos = FacturaRepository.createWithDetails.mock.calls[0][1];
                expect(datos).toMatchObject({ forma_pago: 'mixto', monto_efectivo: 20000, monto_transferencia: 30000 });
            });

            it.each([
                ['una fecha futura', () => sumarDias(hoy, 1), 7, /futura/],
                ['una fecha inválida', () => '2026-02-31', 7, /no es válida/],
                ['un día fuera del evento', () => sumarDias(hoy, -6), 7, /dentro de los días del evento/],
                ['otro día sin evento (POS/mesas)', () => ayer, null, /Solo las ventas de un evento/]
            ])('rechaza %s con error 400 y no crea la factura', async (_nombre, fecha, eventoId, mensaje) => {
                const intento = FacturaService.create(tenantId, {
                    ...facturaValida,
                    evento_id: eventoId,
                    fecha: fecha()
                });
                await expect(intento).rejects.toMatchObject({ status: 400, message: expect.stringMatching(mensaje) });
                expect(FacturaRepository.createWithDetails).not.toHaveBeenCalled();
            });
        });

        it('rechaza un cliente de otro tenant y no crea la factura', async () => {
            const TenantOwnership = require('../../../services/Tenant/TenantOwnership');
            TenantOwnership.clientes.mockRejectedValueOnce(new Error('Cliente no encontrado'));
            await expect(FacturaService.create(tenantId, facturaValida)).rejects.toThrow('Cliente no encontrado');
            expect(FacturaRepository.createWithDetails).not.toHaveBeenCalled();
        });

        it('lanza "Datos incompletos" si falta cliente_id', async () => {
            await expect(FacturaService.create(tenantId, { ...facturaValida, cliente_id: null })).rejects.toThrow(
                'Datos incompletos'
            );
            await expect(FacturaService.create(tenantId, { ...facturaValida, cliente_id: '' })).rejects.toThrow(
                'Datos incompletos'
            );
            expect(FacturaRepository.createWithDetails).not.toHaveBeenCalled();
        });

        it('lanza "Datos incompletos" si productos está vacío o no existe', async () => {
            await expect(FacturaService.create(tenantId, { ...facturaValida, productos: [] })).rejects.toThrow(
                'Datos incompletos'
            );
            await expect(FacturaService.create(tenantId, { cliente_id: 10, total: 100 })).rejects.toThrow(
                'Datos incompletos'
            );
            expect(FacturaRepository.createWithDetails).not.toHaveBeenCalled();
        });

        it('llama al repository y devuelve { id } con datos válidos', async () => {
            FacturaRepository.createWithDetails.mockResolvedValue({ insertId: 99 });
            const result = await FacturaService.create(tenantId, facturaValida);
            expect(FacturaRepository.createWithDetails).toHaveBeenCalledTimes(1);
            expect(FacturaRepository.createWithDetails).toHaveBeenCalledWith(
                tenantId,
                expect.objectContaining({ cliente_id: facturaValida.cliente_id, evento_id: null })
            );
            expect(result).toEqual({ id: 99 });
        });

        it('pasa evento_id cuando viene en los datos', async () => {
            FacturaRepository.createWithDetails.mockResolvedValue({ insertId: 1 });
            await FacturaService.create(tenantId, { ...facturaValida, evento_id: 5 });
            expect(FacturaRepository.createWithDetails).toHaveBeenCalledWith(
                tenantId,
                expect.objectContaining({ evento_id: 5 })
            );
        });

        describe('con modificadores/toppings', () => {
            it('recalcula precio y subtotal sumando el precioAdicionalTotal que devuelve el catálogo (ignora lo que "mandó" el frontend)', async () => {
                ModificadorService.validarYCalcularSeleccion.mockResolvedValueOnce({
                    precioAdicionalTotal: 5000,
                    lineasSnapshot: [
                        {
                            opcion_modificador_id: 1,
                            grupo_nombre: 'Salsa',
                            opcion_nombre: 'BBQ',
                            precio_adicional: 5000
                        }
                    ],
                    modificadoresHash: '1'
                });
                FacturaRepository.createWithDetails.mockResolvedValue({ insertId: 1 });

                const productoConModificador = {
                    producto_id: 1,
                    cantidad: 2,
                    precio: 10000, // precio base que ya mandó el frontend (sin modificadores)
                    subtotal: 20000,
                    modificadores_seleccion: [{ grupo_id: 100, opciones: [1] }]
                };

                await FacturaService.create(tenantId, { ...facturaValida, productos: [productoConModificador] });

                expect(ModificadorService.validarYCalcularSeleccion).toHaveBeenCalledWith(
                    tenantId,
                    1,
                    productoConModificador.modificadores_seleccion,
                    { permitido: true }
                );
                // 10000 (base) + 5000 (adicional del catálogo) = 15000 por unidad; subtotal = 15000 * 2
                expect(productoConModificador.precio).toBe(15000);
                expect(productoConModificador.subtotal).toBe(30000);
                expect(productoConModificador._modificadoresSnapshot).toEqual([
                    { opcion_modificador_id: 1, grupo_nombre: 'Salsa', opcion_nombre: 'BBQ', precio_adicional: 5000 }
                ]);
            });

            it('no modifica precio/subtotal cuando el producto no tiene modificadores seleccionados', async () => {
                FacturaRepository.createWithDetails.mockResolvedValue({ insertId: 1 });
                const producto = { producto_id: 1, cantidad: 2, precio: 10000, subtotal: 20000 };

                await FacturaService.create(tenantId, { ...facturaValida, productos: [producto] });

                expect(producto.precio).toBe(10000);
                expect(producto.subtotal).toBe(20000);
            });

            it('propaga el error y no crea la factura si la selección de modificadores es inválida', async () => {
                ModificadorService.validarYCalcularSeleccion.mockRejectedValueOnce(
                    new Error('Debes elegir al menos 1 opción en "Elige tu salsa"')
                );
                const productoConModificador = {
                    producto_id: 1,
                    cantidad: 1,
                    precio: 10000,
                    subtotal: 10000,
                    modificadores_seleccion: []
                };

                await expect(
                    FacturaService.create(tenantId, { ...facturaValida, productos: [productoConModificador] })
                ).rejects.toThrow('Debes elegir al menos 1 opción');
                expect(FacturaRepository.createWithDetails).not.toHaveBeenCalled();
            });

            it('pasa permitido=false a validarYCalcularSeleccion cuando el usuario no tiene modificadores.ver (no debe poder quedar bloqueado por un grupo obligatorio que nunca vio)', async () => {
                FacturaRepository.createWithDetails.mockResolvedValue({ insertId: 1 });
                const producto = { producto_id: 1, cantidad: 1, precio: 10000, subtotal: 10000 };

                await FacturaService.create(tenantId, {
                    ...facturaValida,
                    productos: [producto],
                    puedeUsarModificadores: false
                });

                expect(ModificadorService.validarYCalcularSeleccion).toHaveBeenCalledWith(tenantId, 1, [], {
                    permitido: false
                });
            });
        });
    });

    describe('getByIdForPrint', () => {
        const tenantId = 1;
        const facturaId = 10;

        it('lanza "Factura no encontrada" si el repository devuelve null', async () => {
            FacturaRepository.findByIdWithClient.mockResolvedValue(null);
            await expect(FacturaService.getByIdForPrint(facturaId, tenantId)).rejects.toThrow('Factura no encontrada');
            expect(FacturaRepository.findByIdWithClient).toHaveBeenCalledWith(facturaId, tenantId);
        });

        it('lanza error si no hay detalles', async () => {
            FacturaRepository.findByIdWithClient.mockResolvedValue({ id: facturaId });
            FacturaRepository.getDetailsByFacturaId.mockResolvedValue([]);
            await expect(FacturaService.getByIdForPrint(facturaId, tenantId)).rejects.toThrow(
                'No se encontraron detalles de la factura'
            );
        });

        it('devuelve { factura, detalles } cuando hay datos', async () => {
            const factura = { id: facturaId, cliente_nombre: 'Test' };
            const detalles = [{ producto_nombre: 'Café', cantidad: 1, subtotal: 5000 }];
            FacturaRepository.findByIdWithClient.mockResolvedValue(factura);
            FacturaRepository.getDetailsByFacturaId.mockResolvedValue(detalles);
            const result = await FacturaService.getByIdForPrint(facturaId, tenantId);
            expect(result).toEqual({ factura, detalles });
        });
    });

    describe('getDetails', () => {
        const tenantId = 1;
        const facturaId = 10;

        it('lanza "Factura no encontrada" si no existe', async () => {
            FacturaRepository.getDetailsForAPI.mockResolvedValue(null);
            await expect(FacturaService.getDetails(facturaId, tenantId)).rejects.toThrow('Factura no encontrada');
        });

        it('devuelve los detalles cuando existen', async () => {
            const details = { factura: { id: facturaId }, cliente: {}, productos: [] };
            FacturaRepository.getDetailsForAPI.mockResolvedValue(details);
            const result = await FacturaService.getDetails(facturaId, tenantId);
            expect(result).toEqual(details);
        });
    });
});
