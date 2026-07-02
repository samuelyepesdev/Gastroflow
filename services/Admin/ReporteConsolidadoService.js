const ejs = require('ejs');
const path = require('path');
const puppeteer = require('puppeteer');
const TenantService = require('./TenantService');
const StatsRepository = require('../../repositories/Tenant/StatsRepository');

function formatMoney(amount) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}

class ReporteConsolidadoService {
    /**
     * Generates a consolidated PDF report for all active tenants.
     * @param {Object} options
     * @param {number} options.mes - Month (1-12)
     * @param {number} options.anio - Year (e.g. 2026)
     * @returns {Promise<Buffer>} PDF Buffer
     */
    static async generarReporteConsolidado(options = {}) {
        const date = new Date();
        const targetMes = options.mes ? parseInt(options.mes, 10) : date.getMonth() + 1;
        const targetAnio = options.anio ? parseInt(options.anio, 10) : date.getFullYear();

        // Validar que no sea una fecha en el futuro
        const requestDate = new Date(targetAnio, targetMes - 1, 1);
        if (requestDate > date) {
            throw new Error('No se puede generar un reporte de un mes futuro.');
        }

        const firstDay = `${targetAnio}-${targetMes.toString().padStart(2, '0')}-01`;
        const lastDayStr = `${targetAnio}-${targetMes.toString().padStart(2, '0')}-${new Date(targetAnio, targetMes, 0).getDate()}`;

        // Nombre del mes en español
        const tempDate = new Date(targetAnio, targetMes - 1, 1);
        const mesNombre = tempDate.toLocaleString('es-CO', { month: 'long', year: 'numeric' });

        console.log(
            `[CONSOLIDADO]: Generando reporte consolidado para el mes ${mesNombre.toUpperCase()} (Rango: ${firstDay} a ${lastDayStr})`
        );

        // Obtener todos los tenants activos
        const allTenants = await TenantService.getAllTenants();
        const activeTenants = (allTenants || []).filter(t => t.activo);

        const activeTenantsData = [];
        let globalTotalSales = 0;
        let globalTotalInvoices = 0;

        for (const tenant of activeTenants) {
            try {
                const totalMes = await StatsRepository.getTotalSales(tenant.id, { desde: firstDay, hasta: lastDayStr });
                const facturasMes = await StatsRepository.getTotalInvoices(tenant.id, {
                    desde: firstDay,
                    hasta: lastDayStr
                });
                const topProductos = await StatsRepository.getTopProducts(tenant.id, 5, {
                    desde: firstDay,
                    hasta: lastDayStr
                });
                const porCategoria = await StatsRepository.getSalesByCategory(tenant.id, {
                    desde: firstDay,
                    hasta: lastDayStr
                });

                globalTotalSales += totalMes;
                globalTotalInvoices += facturasMes;

                activeTenantsData.push({
                    tenant,
                    totalMes,
                    facturasMes,
                    topProductos,
                    porCategoria
                });
            } catch (err) {
                console.error(
                    `[CONSOLIDADO_ERROR] Error obteniendo estadísticas para tenant ${tenant.nombre}:`,
                    err.message
                );
                // Si falla un tenant individual, lo agregamos con datos vacíos para no romper todo el reporte consolidado
                activeTenantsData.push({
                    tenant,
                    totalMes: 0,
                    facturasMes: 0,
                    topProductos: [],
                    porCategoria: [],
                    error: err.message
                });
            }
        }

        const templatePath = path.join(__dirname, '../../views/admin/reportes/consolidado_pdf.ejs');
        const data = {
            mes: mesNombre.toUpperCase(),
            activeTenantsData,
            totals: {
                totalSales: globalTotalSales,
                totalInvoices: globalTotalInvoices
            },
            formatMoney
        };

        const html = await ejs.renderFile(templatePath, data);

        let browser = null;
        try {
            browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
            });
            const page = await browser.newPage();
            await page.setContent(html, { waitUntil: 'networkidle0' });

            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' }
            });

            await browser.close();
            return pdfBuffer;
        } catch (puppeteerError) {
            console.error('[CONSOLIDADO_PDF_EXPORT_ERROR]:', puppeteerError);
            if (browser) {
                try {
                    await browser.close();
                } catch (_e) {
                    /* intentional */
                }
            }
            throw puppeteerError;
        }
    }
}

module.exports = ReporteConsolidadoService;
