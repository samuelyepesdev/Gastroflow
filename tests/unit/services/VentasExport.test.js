/**
 * Excel de ventas (GET /ventas/export): hoja real generada con ExcelJS y leída de vuelta.
 */
const { PassThrough } = require('node:stream');

jest.mock('../../../repositories/Tenant/VentaRepository');
jest.mock('../../../services/Tenant/ConfiguracionService', () => ({
    getForPreview: jest.fn().mockResolvedValue({ nombre_negocio: 'Demo', nit: '900' })
}));
jest.mock('../../../services/Tenant/EventoService', () => ({ getById: jest.fn() }));
jest.mock('../../../repositories/Tenant/Stats/SalesStatsRepository', () => ({ getTotalsByPaymentMethod: jest.fn() }));

const ExcelJS = require('exceljs');
const VentaRepository = require('../../../repositories/Tenant/VentaRepository');
const VentaService = require('../../../services/Tenant/VentaService');
const VentasController = require('../../../app/Http/Controllers/Tenant/VentasController');
const { aHoraColombiaParaExcel } = require('../../../utils/dateHelpers');

async function exportar(rows) {
    VentaRepository.getForExport.mockResolvedValue(rows);
    const salida = new PassThrough();
    const trozos = [];
    salida.on('data', t => trozos.push(t));
    const res = Object.assign(salida, { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), send: jest.fn() });
    await VentasController.export({ tenant: { id: 1 }, query: { desde: '2026-11-01', hasta: '2026-11-03' } }, res);
    await new Promise(r => salida.once('end', r));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.concat(trozos));
    return wb.getWorksheet('Ventas');
}

const venta = extra => ({
    id: 1,
    numero: 8,
    fecha: '2026-11-01 17:00:00',
    cliente: 'Consumidor final',
    forma_pago: 'efectivo',
    total: '50000.00',
    monto_efectivo: '0.00',
    monto_transferencia: '0.00',
    monto_bono: '0.00',
    tipo_venta: 'Venta diaria',
    ...extra
});

describe('VentaService.desglosePago', () => {
    it('usa el desglose guardado cuando existe (pago mixto)', () => {
        expect(
            VentaService.desglosePago(
                venta({ forma_pago: 'mixto', monto_efectivo: '20000', monto_transferencia: '30000' })
            )
        ).toEqual({ efectivo: 20000, transferencia: 30000, bono: 0 });
    });

    it('en facturas antiguas sin desglose lo deduce de la forma de pago', () => {
        expect(VentaService.desglosePago(venta({ forma_pago: 'transferencia' }))).toEqual({
            efectivo: 0,
            transferencia: 50000,
            bono: 0
        });
        expect(VentaService.desglosePago(venta({ forma_pago: 'efectivo' })).efectivo).toBe(50000);
    });
});

describe('aHoraColombiaParaExcel', () => {
    it('una venta guardada a las 17:00 UTC se muestra como las 12:00 de Colombia', () => {
        expect(aHoraColombiaParaExcel('2026-11-01 17:00:00').toISOString()).toBe('2026-11-01T12:00:00.000Z');
    });

    it('una venta de las 8 p. m. en Colombia (01:00 UTC del día siguiente) conserva su día', () => {
        expect(aHoraColombiaParaExcel('2026-11-02 01:00:00').toISOString()).toBe('2026-11-01T20:00:00.000Z');
    });

    it('devuelve null con fechas vacías', () => {
        expect(aHoraColombiaParaExcel(null)).toBeNull();
        expect(aHoraColombiaParaExcel('0000-00-00 00:00:00')).toBeNull();
    });
});

describe('VentasController.export', () => {
    beforeEach(() => jest.clearAllMocks());

    it('arma la hoja con desglose por forma de pago, tipo de venta, hora de Colombia y totales', async () => {
        const hoja = await exportar([
            venta({ id: 1, numero: 8, forma_pago: 'efectivo', total: '50000' }),
            venta({
                id: 2,
                numero: 9,
                forma_pago: 'mixto',
                total: '32000',
                monto_efectivo: '12000',
                monto_transferencia: '20000',
                tipo_venta: 'Evento: Feria'
            }),
            venta({ id: 3, numero: 10, forma_pago: 'bono', total: '10000', monto_bono: '10000' })
        ]);

        const encabezado = hoja.getRow(5).values.slice(1);
        expect(encabezado).toEqual([
            'Factura #',
            'Fecha',
            'Cliente',
            'Tipo de venta',
            'Forma de pago',
            'Efectivo',
            'Transferencia',
            'Bono',
            'Total'
        ]);

        const mixta = hoja.getRow(7).values.slice(1);
        expect(mixta[3]).toBe('Evento: Feria');
        expect(mixta.slice(5)).toEqual([12000, 20000, 0, 32000]);
        expect(mixta[1].toISOString()).toBe('2026-11-01T12:00:00.000Z');

        const totales = hoja.getRow(9).values.slice(1);
        expect(totales[4]).toBe('TOTAL:');
        expect(totales.slice(5).map(c => c.result)).toEqual([62000, 20000, 10000, 92000]);
        expect(totales[8].formula).toBe('SUM(I6:I8)');
    });

    it('sin ventas deja la fila de totales en cero y sin fórmula inválida', async () => {
        const hoja = await exportar([]);
        const totales = hoja.getRow(6).values.slice(1);
        expect(totales[4]).toBe('TOTAL:');
        expect(totales.slice(5)).toEqual([0, 0, 0, 0]);
    });
});
