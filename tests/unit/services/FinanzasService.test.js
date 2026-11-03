jest.mock('../../../repositories/Tenant/FinanzasRepository');
jest.mock('../../../repositories/Tenant/CajaRepository');
jest.mock('../../../repositories/Tenant/ProveedorFacturaRepository');

const FinanzasRepository = require('../../../repositories/Tenant/FinanzasRepository');
const CajaRepository = require('../../../repositories/Tenant/CajaRepository');
const ProveedorFacturaRepository = require('../../../repositories/Tenant/ProveedorFacturaRepository');
const FinanzasService = require('../../../services/Tenant/FinanzasService');
const { hoyColombia, sumarDias } = require('../../../utils/dateHelpers');

const manual = extra => ({ monto: 50000, tipo: 'salida', motivo: 'Factura luz', usuario_id: 3, ...extra });

describe('FinanzasService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        CajaRepository.getSesionAbierta.mockResolvedValue({ id: 77, usuario_id: 9 });
        FinanzasRepository.createMovimiento.mockResolvedValue(1);
    });

    describe('registrarMovimientoManual: fecha de la transacción', () => {
        it('sin fecha usa hoy (Colombia) y entra al turno de caja abierto', async () => {
            await FinanzasService.registrarMovimientoManual(1, manual());
            const data = FinanzasRepository.createMovimiento.mock.calls[0][1];
            expect(data.fecha_movimiento).toBe(hoyColombia());
            expect(data.sesion_id).toBe(77);
        });

        it('guarda la fecha real de la factura, no la del día que se registra', async () => {
            const fecha = sumarDias(hoyColombia(), -9);
            await FinanzasService.registrarMovimientoManual(1, manual({ fecha }));
            expect(FinanzasRepository.createMovimiento.mock.calls[0][1].fecha_movimiento).toBe(fecha);
        });

        it('un movimiento con fecha pasada NO se asigna al turno de caja de hoy (no descuadra el arqueo)', async () => {
            await FinanzasService.registrarMovimientoManual(1, manual({ fecha: sumarDias(hoyColombia(), -2) }));
            expect(CajaRepository.getSesionAbierta).not.toHaveBeenCalled();
            expect(FinanzasRepository.createMovimiento.mock.calls[0][1].sesion_id).toBeNull();
        });

        it('varias facturas viejas cargadas hoy quedan cada una en su fecha', async () => {
            const hoy = hoyColombia();
            const fechas = [sumarDias(hoy, -20), sumarDias(hoy, -13), sumarDias(hoy, -6)];
            for (const fecha of fechas) {
                await FinanzasService.registrarMovimientoManual(1, manual({ fecha }));
            }
            expect(FinanzasRepository.createMovimiento.mock.calls.map(c => c[1].fecha_movimiento)).toEqual(fechas);
        });

        it.each([
            ['una fecha futura', () => sumarDias(hoyColombia(), 1), /futura/],
            ['demasiado antigua', () => sumarDias(hoyColombia(), -1900), /antigua/],
            ['con formato inválido', () => '14/10/2026', /no es válida/],
            ['un día que no existe', () => '2026-02-30', /no es válida/],
            ['un mes que no existe', () => '2026-13-01', /no es válida/]
        ])('rechaza %s', async (_nombre, fecha, mensaje) => {
            await expect(FinanzasService.registrarMovimientoManual(1, manual({ fecha: fecha() }))).rejects.toThrow(
                mensaje
            );
            expect(FinanzasRepository.createMovimiento).not.toHaveBeenCalled();
        });

        it('mantiene las validaciones previas (monto y tipo)', async () => {
            await expect(FinanzasService.registrarMovimientoManual(1, manual({ monto: 0 }))).rejects.toThrow(/monto/);
            await expect(FinanzasService.registrarMovimientoManual(1, manual({ tipo: 'otro' }))).rejects.toThrow(
                /Tipo/
            );
        });
    });

    describe('registrarIngresoVenta: venta de un evento en otro día', () => {
        it('con fecha guarda ese día y no usa el turno de caja abierto', async () => {
            const fecha = sumarDias(hoyColombia(), -2);
            await FinanzasService.registrarIngresoVenta(1, { monto: 32000, factura_id: 15, usuario_id: 3, fecha });
            const data = FinanzasRepository.createMovimiento.mock.calls[0][1];
            expect(data.fecha_movimiento).toBe(fecha);
            expect(data.sesion_id).toBeNull();
            expect(CajaRepository.getSesionAbierta).not.toHaveBeenCalled();
        });

        it('sin fecha sigue entrando al turno de caja abierto de hoy', async () => {
            await FinanzasService.registrarIngresoVenta(1, { monto: 32000, factura_id: 16, usuario_id: 3 });
            const data = FinanzasRepository.createMovimiento.mock.calls[0][1];
            expect(data.sesion_id).toBe(77);
            expect(data.fecha_movimiento).toBeUndefined();
        });
    });

    describe('getDashboardData: fechas reales', () => {
        const hoy = hoyColombia();
        const hace = n => sumarDias(hoy, -n);

        beforeEach(() => {
            FinanzasRepository.getResumenPeriodo.mockResolvedValue([]);
            FinanzasRepository.getPorCategoria.mockResolvedValue([]);
            FinanzasRepository.getCostosFijosActivosMensual.mockResolvedValue(0);
            FinanzasRepository.getDesglosePorFormaPago.mockResolvedValue({ efectivo: 0, transferencia: 0, bono: 0 });
            FinanzasRepository.getMovimientosPeriodo.mockResolvedValue([]);
            ProveedorFacturaRepository.sumaPorPeriodo.mockResolvedValue(0);
            ProveedorFacturaRepository.findPendientes.mockResolvedValue([]);
            ProveedorFacturaRepository.sumaPorDia.mockResolvedValue([]);
            FinanzasRepository.getHistoricoDiario.mockResolvedValue([]);
        });

        it('consulta por días Colombia (no por rangos UTC de created_at)', async () => {
            await FinanzasService.getDashboardData(1, 30);
            expect(FinanzasRepository.getHistoricoDiario).toHaveBeenCalledWith(1, hace(29), hoy);
            expect(FinanzasRepository.getMovimientosPeriodo).toHaveBeenCalledWith(1, hace(29), hoy);
            expect(FinanzasRepository.getResumenPeriodo).toHaveBeenCalledWith(1, hace(29), hoy);
            // periodo anterior: los 30 días inmediatamente previos
            expect(FinanzasRepository.getResumenPeriodo).toHaveBeenCalledWith(1, hace(59), hace(30));
        });

        it('la serie diaria cubre TODOS los días del rango, con ceros donde no hubo movimiento', async () => {
            FinanzasRepository.getHistoricoDiario.mockResolvedValue([
                { fecha: hace(9), ingresos: 0, egresos: 120000 },
                { fecha: hoy, ingresos: 300000, egresos: 0 }
            ]);
            const r = await FinanzasService.getDashboardData(1, 30);
            expect(r.historico).toHaveLength(30);
            expect(r.historico[0].fecha).toBe(hace(29));
            expect(r.historico[29].fecha).toBe(hoy);
            expect(r.historico.find(h => h.fecha === hace(9))).toEqual({
                fecha: hace(9),
                ingresos: 0,
                egresos: 120000
            });
            expect(r.historico.find(h => h.fecha === hace(5))).toEqual({ fecha: hace(5), ingresos: 0, egresos: 0 });
            expect(r.desde).toBe(hace(29));
            expect(r.hasta).toBe(hoy);
        });

        it('suma las facturas de proveedor en el día de su fecha de emisión', async () => {
            FinanzasRepository.getHistoricoDiario.mockResolvedValue([{ fecha: hace(4), ingresos: 0, egresos: 10000 }]);
            ProveedorFacturaRepository.sumaPorDia.mockResolvedValue([
                { dia: hace(4), total: 90000 },
                { dia: hace(12), total: 40000 }
            ]);
            const r = await FinanzasService.getDashboardData(1, 30);
            expect(r.historico.find(h => h.fecha === hace(4)).egresos).toBe(100000);
            expect(r.historico.find(h => h.fecha === hace(12)).egresos).toBe(40000);
            expect(r.historico.find(h => h.fecha === hoy).egresos).toBe(0);
        });

        it('el libro diario llega con los movimientos del periodo (fecha real incluida)', async () => {
            const movs = [{ id: 1, fecha: hace(8), created_at: new Date(), monto: 5000 }];
            FinanzasRepository.getMovimientosPeriodo.mockResolvedValue(movs);
            const r = await FinanzasService.getDashboardData(1, 30);
            expect(r.movimientos).toBe(movs);
        });
    });
});
