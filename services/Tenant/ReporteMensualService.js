const ejs = require('ejs');
const path = require('node:path');
const { renderPdf } = require('../Shared/PdfBrowser');
const MailerService = require('../Shared/MailerService');
const StatsRepository = require('../../repositories/Tenant/StatsRepository');
const TenantService = require('../Admin/TenantService');

function formatMoney(amount) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}

class ReporteMensualService {
    /**
     * Calcula las fechas de inicio, fin y el nombre del mes para el reporte.
     */
    static calcularRangoFechas(options = {}) {
        const date = new Date();
        let targetYear = date.getFullYear();
        let targetMonth = date.getMonth();

        if (options.mes !== null && options.mes !== undefined && options.anio !== null && options.anio !== undefined) {
            targetMonth = Number.parseInt(options.mes, 10) - 1;
            targetYear = Number.parseInt(options.anio, 10);

            const requestDate = new Date(targetYear, targetMonth, 1);
            if (requestDate > date) {
                throw new Error('No se puede generar un reporte de un mes futuro.');
            }
        } else if (options.finDeMes) {
            targetMonth = date.getMonth();
            targetYear = date.getFullYear();
        } else if (!options.testMesActual) {
            date.setMonth(date.getMonth() - 1);
            targetMonth = date.getMonth();
            targetYear = date.getFullYear();
        }

        const m = targetMonth + 1;
        const firstDay = `${targetYear}-${m.toString().padStart(2, '0')}-01`;
        const lastDayStr = `${targetYear}-${m.toString().padStart(2, '0')}-${new Date(targetYear, m, 0).getDate()}`;
        const tempDate = new Date(targetYear, targetMonth, 1);
        const mesNombre = tempDate.toLocaleString('es-CO', { month: 'long', year: 'numeric' });

        return { firstDay, lastDayStr, mesNombre };
    }

    /**
     * Obtiene en paralelo las estadísticas de ventas del tenant.
     */
    static async obtenerEstadisticas(tenantId, { firstDay, lastDayStr }) {
        const filtro = { desde: firstDay, hasta: lastDayStr };
        const [totalMes, facturasMes, topProductos, porCategoria] = await Promise.all([
            StatsRepository.getTotalSales(tenantId, filtro),
            StatsRepository.getTotalInvoices(tenantId, filtro),
            StatsRepository.getTopProducts(tenantId, 5, filtro),
            StatsRepository.getSalesByCategory(tenantId, filtro)
        ]);
        return { totalMes, facturasMes, topProductos, porCategoria };
    }

    /**
     * Renderiza la plantilla EJS y genera el PDF mediante Puppeteer.
     */
    static async generarPdfReporte(tenant, mesNombre, stats) {
        const templatePath = path.join(__dirname, '../../views/reportes/mensual.ejs');
        const data = {
            tenant,
            mes: mesNombre.toUpperCase(),
            ...stats,
            formatMoney
        };

        const html = await ejs.renderFile(templatePath, data);

        return renderPdf(
            html,
            {
                format: 'A4',
                printBackground: true,
                margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' }
            },
            { waitUntil: 'networkidle0' }
        );
    }

    /**
     * Determina la dirección de correo destino para el reporte.
     */
    static obtenerEmailDestinatario(tenant, options) {
        if (options.testEmail) {
            return options.testEmail;
        }
        return tenant.email || tenant.config?.correo || process.env.ADMIN_EMAIL || 'contacto@ejemplo.com';
    }

    static async generarYEnviar(tenant, options = {}) {
        const rango = this.calcularRangoFechas(options);
        console.log(`Generando reporte para ${tenant.nombre} - Rango: ${rango.firstDay} a ${rango.lastDayStr}...`);

        const stats = await this.obtenerEstadisticas(tenant.id, rango);
        const pdfBuffer = await this.generarPdfReporte(tenant, rango.mesNombre, stats);
        const to = this.obtenerEmailDestinatario(tenant, options);

        const mesUpper = rango.mesNombre.toUpperCase();
        const subject = `Reporte Mensual - ${tenant.nombre} - ${mesUpper}`;
        const bodyContent = `Hola,<br><br>Adjunto enviamos el reporte de resumen de ventas de <strong>${mesUpper}</strong> para <strong>${tenant.nombre}</strong>.<br><br>Saludos cordiales,<br>Tu Sistema GastroFlow`;

        try {
            const mailResult = await MailerService.sendMail({
                to,
                subject,
                html: bodyContent,
                attachments: [
                    {
                        filename: `Reporte_${mesUpper.replaceAll(' ', '_')}_${tenant.nombre.replaceAll(' ', '_')}.pdf`,
                        content: pdfBuffer
                    }
                ]
            });

            return { ...mailResult, emailValido: to, pdfBuffer };
        } catch (mailError) {
            console.error('Error enviando el correo desde ReporteMensual:', mailError);
            throw mailError;
        }
    }

    /**
     * Función llamada por el CRON el último día de cada mes (o el día 1 si es manual/antiguo)
     */
    static async procesarCierreMensual(options = {}) {
        console.log('--- Iniciando CRON de cierre mensual de reportes ---');
        const tenants = await TenantService.getAllTenants();

        // 1. Filtrar declarativamente los inquilinos activos (Programación Funcional)
        const tenantsActivos = (tenants || []).filter(t => t?.activo);

        // 2. Procesar concurrentemente en paralelo todos los reportes usando .map() y Promise.all()
        await Promise.all(
            tenantsActivos.map(async t => {
                try {
                    // Si se llama desde el cron de fin de mes, options tendrá { finDeMes: true }
                    // Si no, por defecto será para enviar el mes anterior.
                    await this.generarYEnviar(t, { testMesActual: false, ...options });
                } catch (err) {
                    console.error(`Error enviando reporte mensual a tenant ${t.nombre}:`, err.message);
                }
            })
        );

        console.log('--- Fin de CRON de cierre mensual ---');
    }
}

module.exports = ReporteMensualService;
