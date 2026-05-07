const ejs = require('ejs');
const path = require('path');
const puppeteer = require('puppeteer');
const MailerService = require('../Shared/MailerService');
const StatsRepository = require('../../repositories/Tenant/StatsRepository');
const TenantService = require('../Admin/TenantService');
const WhatsAppService = require('./WhatsAppService');

function formatMoney(amount) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}

class ReporteMensualService {
    static async generarYEnviar(tenant, options = {}) {
        let firstDay, lastDayStr, mesNombre;

        const date = new Date();
        let targetYear = date.getFullYear();
        let targetMonth = date.getMonth(); // 0-11 (por defecto el mes actual para pruebas rápidas)

        if (options.mes != null && options.anio != null) {
            targetMonth = parseInt(options.mes) - 1; // Recibimos 1-12
            targetYear = parseInt(options.anio);
            
            // Validar que no sea un mes futuro
            const requestDate = new Date(targetYear, targetMonth, 1);
            if (requestDate > date) {
                throw new Error('No se puede generar un reporte de un mes futuro.');
            }
        } else if (options.finDeMes) {
            // Producción normal (Cron último día): Cierre del MES ACTUAL
            targetMonth = date.getMonth();
            targetYear = date.getFullYear();
        } else if (!options.testMesActual) {
            // Producción (Cron Antiguo): Cierre del MES ANTERIOR
            date.setMonth(date.getMonth() - 1);
            targetMonth = date.getMonth();
            targetYear = date.getFullYear();
        }

        const m = targetMonth + 1;
        firstDay = `${targetYear}-${m.toString().padStart(2, '0')}-01`;
        lastDayStr = `${targetYear}-${m.toString().padStart(2, '0')}-${new Date(targetYear, m, 0).getDate()}`;
        
        // Nombre del mes en español
        const tempDate = new Date(targetYear, targetMonth, 1);
        mesNombre = tempDate.toLocaleString('es-CO', { month: 'long', year: 'numeric' });

        console.log(`Generando reporte para ${tenant.nombre} - Rango: ${firstDay} a ${lastDayStr}...`);

        const totalMes = await StatsRepository.getTotalSales(tenant.id, { desde: firstDay, hasta: lastDayStr });
        const facturasMes = await StatsRepository.getTotalInvoices(tenant.id, { desde: firstDay, hasta: lastDayStr });
        const topProductos = await StatsRepository.getTopProducts(tenant.id, 5, { desde: firstDay, hasta: lastDayStr });
        const porCategoria = await StatsRepository.getSalesByCategory(tenant.id, { desde: firstDay, hasta: lastDayStr });

        const templatePath = path.join(__dirname, '../../views/reportes/mensual.ejs');
        const data = {
            tenant,
            mes: mesNombre.toUpperCase(),
            totalMes,
            facturasMes,
            topProductos,
            porCategoria,
            formatMoney
        };

        const html = await ejs.renderFile(templatePath, data);

        // Render PDF usando Puppeteer
        const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' } });
        await browser.close();

        // Determinar destinatario
        let to = options.testEmail;
        if (!to) {
            to = tenant.email || (tenant.config && tenant.config.correo) || process.env.ADMIN_EMAIL || 'contacto@ejemplo.com';
        }

        const subject = `Reporte Mensual - ${tenant.nombre} - ${data.mes}`;
        const bodyContent = `Hola,<br><br>Adjunto enviamos el reporte de resumen de ventas de <strong>${data.mes}</strong> para <strong>${tenant.nombre}</strong>.<br><br>Saludos cordiales,<br>Tu Sistema Ecl-Fruver`;

        try {
            const mailResult = await MailerService.sendMail({
                to,
                subject,
                html: bodyContent,
                attachments: [{
                    filename: `Reporte_${data.mes.replace(/ /g, '_')}_${tenant.nombre.replace(/ /g, '_')}.pdf`,
                    content: pdfBuffer
                }]
            });

            let waSent = false;
            // WhatsApp Notification
            if (tenant.telefono) {
                try {
                    const filename = `Reporte_${data.mes.replace(/ /g, '_')}_${tenant.nombre.replace(/ /g, '_')}.pdf`;
                    const caption = `Hola *${tenant.nombre}*! 👋\n\nAquí tienes el resumen de ventas de *${data.mes}*.\n\n_Tu Sistema Ecl-Fruver_`;

                    // Intentamos enviar desde el propio bot del tenant si está conectado. 
                    // El servicio ahora maneja automáticamente el formato 57+numero.
                    waSent = await WhatsAppService.sendMediaMessage(tenant.id, tenant.telefono, pdfBuffer, filename, caption);

                    // Si no tiene bot conectado, intentamos desde el tenantPrincipal (id 1)
                    if (!waSent && tenant.id !== 1) {
                         waSent = await WhatsAppService.sendMediaMessage(1, tenant.telefono, pdfBuffer, filename, caption);
                    }

                    if (waSent) {
                        console.log(`[WhatsApp] Reporte mensual enviado a ${tenant.nombre} (${tenant.telefono})`);
                    }
                } catch (waError) {
                    console.error('[WhatsApp] Error enviando reporte mensual:', waError.message);
                }
            }

            return { ...mailResult, emailValido: to, whatsappEnviado: waSent, pdfBuffer };
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
        const tenantsActivos = (tenants || []).filter(t => t && t.activo);

        // 2. Procesar concurrentemente en paralelo todos los reportes usando .map() y Promise.all()
        await Promise.all(
            tenantsActivos.map(async (t) => {
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
