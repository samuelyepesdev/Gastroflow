/**
 * Tests de humo para los 3 servicios que generan PDF con pdfmake (sin Chromium):
 * PlanesPdfService, ReporteMensualService, ReporteConsolidadoService.
 *
 * No hay snapshot de layout -- lo que se valida es que el docDefinition que arma
 * cada servicio sea válido para pdfmake (si no, `getBuffer()` rechaza) y que el
 * resultado sea un PDF real (firma `%PDF`), con datos "felices" y con listas
 * vacías (las plantillas viejas tenían un "no hay datos" para ese caso).
 */

jest.mock('../../../repositories/Admin/PlanRepository', () => ({
    findAll: jest.fn()
}));
jest.mock('../../../repositories/Tenant/StatsRepository', () => ({
    getTotalSales: jest.fn(),
    getTotalInvoices: jest.fn(),
    getVentasPorTenantYMes: jest.fn(),
    getTopProducts: jest.fn(),
    getSalesByCategory: jest.fn(),
    getTotalsByPaymentMethod: jest.fn(),
    getSalesByPaymentMethod: jest.fn(),
    getDailySalesRange: jest.fn(),
    getPrimeraFechaVenta: jest.fn()
}));
jest.mock('../../../services/Admin/TenantService', () => ({
    getAllTenants: jest.fn()
}));

const PlanesPdfService = require('../../../services/Admin/PlanesPdfService');
const ReporteMensualService = require('../../../services/Tenant/ReporteMensualService');
const ReporteConsolidadoService = require('../../../services/Admin/ReporteConsolidadoService');
const PlanRepository = require('../../../repositories/Admin/PlanRepository');
const StatsRepository = require('../../../repositories/Tenant/StatsRepository');
const TenantService = require('../../../services/Admin/TenantService');

function expectValidPdf(buffer) {
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(500);
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
}

describe('PlanesPdfService.generarPortafolioPdf', () => {
    beforeEach(() => jest.clearAllMocks());

    it('genera un PDF válido con planes reales', async () => {
        PlanRepository.findAll.mockResolvedValue([
            {
                id: 1,
                nombre: 'Pro',
                slug: 'pro',
                descripcion: 'El plan intermedio.',
                descripcion_detallada: 'Incluye soporte prioritario.',
                caracteristicas: ['inventario', 'reportes_avanzados', 'multi_sede'],
                precio_pequeno: 90000,
                precio_mediano: 150000,
                precio_grande: 250000
            }
        ]);
        const buffer = await PlanesPdfService.generarPortafolioPdf();
        expectValidPdf(buffer);
    });

    it('no revienta con la lista de planes vacía', async () => {
        PlanRepository.findAll.mockResolvedValue([]);
        const buffer = await PlanesPdfService.generarPortafolioPdf();
        expectValidPdf(buffer);
    });
});

describe('ReporteMensualService.generarPdfReporte', () => {
    it('genera un PDF válido con y sin datos de ventas', async () => {
        const tenant = { id: 1, nombre: 'Restaurante Demo' };

        const conDatos = await ReporteMensualService.generarPdfReporte(tenant, 'enero 2026', {
            totalMes: 4500000,
            facturasMes: 32,
            topProductos: [
                { nombre: 'Bandeja Paisa', categoria_nombre: 'Comidas', total_cantidad: 20, total_ventas: 800000 }
            ],
            porCategoria: [{ categoria_nombre: 'Comidas', facturas_count: 32, total_ventas: 4500000 }]
        });
        expectValidPdf(conDatos);

        const conGraficas = await ReporteMensualService.generarPdfReporte(tenant, 'enero 2026', {
            totalMes: 4500000,
            facturasMes: 32,
            topProductos: [],
            porCategoria: [{ categoria_nombre: 'Comidas', facturas_count: 32, total_ventas: 4500000 }],
            ventasDiarias: Array.from({ length: 31 }, (_, i) => ({
                fecha: `2026-01-${String(i + 1).padStart(2, '0')}`,
                cantidad_facturas: 1,
                total_ventas: i % 3 === 0 ? 0 : 150000 * (i + 1)
            })),
            pagos: { efectivo: 3000000, transferencia: 1000000, serviciosExternos: 500000 }
        });
        expectValidPdf(conGraficas);
        expect(conGraficas.length).toBeGreaterThan(conDatos.length);

        const sinDatos = await ReporteMensualService.generarPdfReporte(tenant, 'febrero 2026', {
            totalMes: 0,
            facturasMes: 0,
            topProductos: [],
            porCategoria: []
        });
        expectValidPdf(sinDatos);
    });
});

describe('ReporteConsolidadoService.generarReporteConsolidado', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        StatsRepository.getVentasPorTenantYMes.mockResolvedValue([]);
    });

    it('genera un PDF válido para varios tenants en un rango de varios meses', async () => {
        TenantService.getAllTenants.mockResolvedValue([
            { id: 1, nombre: 'Restaurante A', slug: 'restaurante-a', plan_nombre: 'Pro', activo: true },
            { id: 2, nombre: 'Restaurante B', slug: 'restaurante-b', plan_nombre: null, activo: true }
        ]);
        StatsRepository.getVentasPorTenantYMes.mockResolvedValue([
            { tenant_id: 1, mes: '2026-01', total: 400000, cantidad: 4 },
            { tenant_id: 1, mes: '2026-02', total: 600000, cantidad: 6 },
            { tenant_id: 2, mes: '2026-03', total: 1000000, cantidad: 10 }
        ]);
        StatsRepository.getTopProducts.mockResolvedValue([
            { nombre: 'Producto X', categoria_nombre: 'Bebidas', total_cantidad: 5, total_ventas: 50000 }
        ]);
        StatsRepository.getSalesByCategory.mockResolvedValue([
            { categoria_nombre: 'Bebidas', total_cantidad: 40, facturas_count: 10, total_ventas: 1000000 }
        ]);
        StatsRepository.getTotalsByPaymentMethod.mockResolvedValue({
            efectivo: 600000,
            transferencia: 400000,
            serviciosExternos: 0
        });
        StatsRepository.getSalesByPaymentMethod.mockResolvedValue([
            { forma_pago: 'efectivo', cantidad: 6, total: 600000 },
            { forma_pago: 'transferencia', cantidad: 4, total: 400000 }
        ]);
        StatsRepository.getDailySalesRange.mockResolvedValue([]);

        const buffer = await ReporteConsolidadoService.generarReporteConsolidado({
            mesDesde: 1,
            anioDesde: 2026,
            mesHasta: 3,
            anioHasta: 2026
        });
        expectValidPdf(buffer);
        expect(StatsRepository.getSalesByPaymentMethod).toHaveBeenCalled();
        // Totales y resumen mensual salen de UNA consulta agrupada, no de 2 por restaurante y por mes
        expect(StatsRepository.getVentasPorTenantYMes).toHaveBeenCalledTimes(1);
        expect(StatsRepository.getVentasPorTenantYMes).toHaveBeenCalledWith([1, 2], '2026-01-01', '2026-03-31');
        expect(StatsRepository.getTotalSales).not.toHaveBeenCalled();
        expect(StatsRepository.getTotalInvoices).not.toHaveBeenCalled();
    });

    it('genera el reporte histórico desde la primera venta', async () => {
        TenantService.getAllTenants.mockResolvedValue([
            { id: 1, nombre: 'Restaurante A', slug: 'restaurante-a', plan_nombre: 'Pro', activo: true }
        ]);
        StatsRepository.getPrimeraFechaVenta.mockResolvedValue('2026-01-15');
        StatsRepository.getTopProducts.mockResolvedValue([]);
        StatsRepository.getSalesByCategory.mockResolvedValue([]);
        StatsRepository.getTotalsByPaymentMethod.mockResolvedValue({
            efectivo: 0,
            transferencia: 0,
            serviciosExternos: 0
        });
        StatsRepository.getSalesByPaymentMethod.mockResolvedValue([]);
        StatsRepository.getDailySalesRange.mockResolvedValue([]);

        const buffer = await ReporteConsolidadoService.generarReporteConsolidado({ historico: true, tenantId: 1 });
        expectValidPdf(buffer);
        expect(StatsRepository.getVentasPorTenantYMes).toHaveBeenCalledWith([1], '2026-01-01', expect.any(String));
    });

    it('no revienta cuando no hay tenants activos', async () => {
        TenantService.getAllTenants.mockResolvedValue([]);

        const buffer = await ReporteConsolidadoService.generarReporteConsolidado({ mesDesde: 1, anioDesde: 2026 });
        expectValidPdf(buffer);
    });

    it('incluye el bloque de error cuando falla un tenant específico', async () => {
        TenantService.getAllTenants.mockResolvedValue([
            { id: 1, nombre: 'Restaurante Roto', slug: 'restaurante-roto', activo: true }
        ]);
        StatsRepository.getTopProducts.mockRejectedValue(new Error('DB caída'));
        StatsRepository.getSalesByCategory.mockResolvedValue([]);

        const buffer = await ReporteConsolidadoService.generarReporteConsolidado({ mesDesde: 1, anioDesde: 2026 });
        expectValidPdf(buffer);
    });

    it('si falla la consulta agrupada el reporte falla (no entrega totales en 0 en silencio)', async () => {
        TenantService.getAllTenants.mockResolvedValue([{ id: 1, nombre: 'A', slug: 'a', activo: true }]);
        StatsRepository.getVentasPorTenantYMes.mockRejectedValue(new Error('DB caída'));
        await expect(
            ReporteConsolidadoService.generarReporteConsolidado({ mesDesde: 1, anioDesde: 2026 })
        ).rejects.toThrow('DB caída');
    });

    it('procesa los restaurantes en tandas de 2: nunca más de 2 a la vez', async () => {
        TenantService.getAllTenants.mockResolvedValue(
            [1, 2, 3, 4, 5].map(id => ({ id, nombre: 'R' + id, slug: 'r' + id, activo: true }))
        );
        let activos = 0;
        let maximo = 0;
        StatsRepository.getTopProducts.mockImplementation(async () => {
            activos += 1;
            maximo = Math.max(maximo, activos);
            await new Promise(r => setTimeout(r, 5));
            activos -= 1;
            return [];
        });
        StatsRepository.getSalesByCategory.mockResolvedValue([]);
        StatsRepository.getTotalsByPaymentMethod.mockResolvedValue({
            efectivo: 0,
            transferencia: 0,
            serviciosExternos: 0
        });
        StatsRepository.getSalesByPaymentMethod.mockResolvedValue([]);
        StatsRepository.getDailySalesRange.mockResolvedValue([]);
        await ReporteConsolidadoService.generarReporteConsolidado({ mesDesde: 1, anioDesde: 2026 });
        expect(maximo).toBe(2);
    });
});
