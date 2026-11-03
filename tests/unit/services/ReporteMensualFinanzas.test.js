/**
 * Reporte mensual: secciones de Finanzas y de ventas de eventos (repositorios y Finanzas mockeados).
 */

jest.mock('../../../repositories/Tenant/StatsRepository', () => ({
    getTotalSales: jest.fn().mockResolvedValue(1000000),
    getTotalInvoices: jest.fn().mockResolvedValue(10),
    getTopProducts: jest.fn().mockResolvedValue([]),
    getSalesByCategory: jest.fn().mockResolvedValue([]),
    getTotalsByPaymentMethod: jest.fn().mockResolvedValue({ efectivo: 0, transferencia: 0, serviciosExternos: 0 }),
    getSalesByPaymentMethod: jest.fn().mockResolvedValue([]),
    getDailySalesRange: jest.fn().mockResolvedValue([]),
    getPrimeraFechaVenta: jest.fn(),
    getVentasPorEventoEnRango: jest.fn()
}));
jest.mock('../../../services/Tenant/FinanzasService', () => ({
    getDashboardData: jest.fn()
}));
jest.mock('../../../services/Admin/TenantService', () => ({ getAllTenants: jest.fn() }));

const ReporteMensualService = require('../../../services/Tenant/ReporteMensualService');
const StatsRepository = require('../../../repositories/Tenant/StatsRepository');
const FinanzasService = require('../../../services/Tenant/FinanzasService');

const finanzas = {
    ingresos: 1500000,
    aportes: 0,
    egresos: 900000,
    utilidad: 600000,
    egresosCaja: 400000,
    costosFijosPeriodo: 300000,
    proveedoresPeriodo: 200000,
    gastosPorCategoria: [{ categoria_gasto: 'Insumos Generales', total: 400000 }]
};
const eventos = [
    { evento_nombre: 'Feria navideña', cantidad_ventas: 4, total_ventas: 500000 },
    { evento_nombre: 'Concierto', cantidad_ventas: 2, total_ventas: 250000 }
];
const base = { totalMes: 1000000, facturasMes: 10, topProductos: [], porCategoria: [] };
const textoDelDoc = stats =>
    JSON.stringify(ReporteMensualService.buildDocDefinition({ nombre: 'Demo' }, 'enero 2026', { ...base, ...stats }));

describe('ReporteMensualService: finanzas y eventos', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        FinanzasService.getDashboardData.mockResolvedValue(finanzas);
        StatsRepository.getVentasPorEventoEnRango.mockResolvedValue(eventos);
    });

    it('incluye los egresos/utilidad de Finanzas y las ventas de cada evento', () => {
        const doc = textoDelDoc({ finanzas, eventos });
        expect(doc).toContain('Finanzas del Periodo');
        expect(doc).toContain('Insumos Generales');
        expect(doc).toContain('Ventas de Eventos');
        expect(doc).toContain('Feria navideña');
        expect(doc).toContain('Total eventos');
    });

    it('omite las secciones cuando no hay actividad de Finanzas ni ventas de eventos', () => {
        const sinActividad = { ...finanzas, ingresos: 0, aportes: 0, egresos: 0, utilidad: 0 };
        const doc = textoDelDoc({ finanzas: sinActividad, eventos: [] });
        expect(doc).not.toContain('Finanzas del Periodo');
        expect(doc).not.toContain('Ventas de Eventos');
        expect(textoDelDoc({ finanzas: null })).not.toContain('Finanzas del Periodo');
    });

    it('obtenerEstadisticas pide Finanzas y eventos del mismo rango del mes', async () => {
        const stats = await ReporteMensualService.obtenerEstadisticas(1, {
            firstDay: '2026-01-01',
            lastDayStr: '2026-01-31'
        });
        expect(FinanzasService.getDashboardData).toHaveBeenCalledWith(1, 31, '2026-01-31');
        expect(StatsRepository.getVentasPorEventoEnRango).toHaveBeenCalledWith(1, '2026-01-01', '2026-01-31');
        expect(stats.finanzas).toEqual(finanzas);
        expect(stats.eventos).toHaveLength(2);
    });

    it('si Finanzas o eventos fallan, el reporte de ventas sale igual', async () => {
        const espia = jest.spyOn(console, 'error').mockImplementation(() => {});
        FinanzasService.getDashboardData.mockRejectedValue(new Error('boom'));
        StatsRepository.getVentasPorEventoEnRango.mockRejectedValue(new Error('boom'));
        const stats = await ReporteMensualService.obtenerEstadisticas(1, {
            firstDay: '2026-01-01',
            lastDayStr: '2026-01-31'
        });
        espia.mockRestore();
        expect(stats.totalMes).toBe(1000000);
        expect(stats.finanzas).toBeNull();
        expect(stats.eventos).toEqual([]);
    });
});
