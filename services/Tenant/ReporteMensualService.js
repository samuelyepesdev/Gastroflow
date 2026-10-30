const PdfMaker = require('../Shared/PdfMaker');
const {
    formatMoney,
    statCard,
    sectionTitle,
    footerText,
    productosTable,
    categoriaTable,
    medioPagoTable,
    encabezadoMarca
} = require('../Shared/PdfDocHelpers');
const PdfCharts = require('../Shared/PdfCharts');
const MailerService = require('../Shared/MailerService');
const StatsRepository = require('../../repositories/Tenant/StatsRepository');
const TenantService = require('../Admin/TenantService');
const { hoyColombia } = require('../../utils/dateHelpers');

const COLOR_REPORTE = '#28a745';
// Por encima de este rango la línea diaria ya no se lee bien: se omite.
const MAX_DIAS_GRAFICA_DIARIA = 62;

function diasEntre(desde, hasta) {
    const [y1, m1, d1] = desde.split('-').map(Number);
    const [y2, m2, d2] = hasta.split('-').map(Number);
    return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000) + 1;
}

function nombreMesAnio(fechaISO) {
    const [y, m] = fechaISO.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleString('es-CO', { month: 'long', year: 'numeric' });
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
     * Rango "desde el inicio": del primer día con ventas del tenant hasta hoy (Colombia).
     * Si nunca ha vendido, devuelve solo el día de hoy.
     */
    static async calcularRangoHistorico(tenantId) {
        const hoy = hoyColombia();
        const primera = (await StatsRepository.getPrimeraFechaVenta(tenantId)) || hoy;
        return {
            firstDay: primera,
            lastDayStr: hoy,
            mesNombre: `Desde el inicio (${nombreMesAnio(primera)} - ${nombreMesAnio(hoy)})`
        };
    }

    /**
     * Obtiene en paralelo las estadísticas de ventas del tenant.
     */
    static async obtenerEstadisticas(tenantId, { firstDay, lastDayStr }) {
        const filtro = { desde: firstDay, hasta: lastDayStr };
        const conGraficaDiaria = diasEntre(firstDay, lastDayStr) <= MAX_DIAS_GRAFICA_DIARIA;
        const [totalMes, facturasMes, topProductos, porCategoria, ventasDiarias, pagos, porMedio] = await Promise.all([
            StatsRepository.getTotalSales(tenantId, filtro),
            StatsRepository.getTotalInvoices(tenantId, filtro),
            StatsRepository.getTopProducts(tenantId, 5, filtro),
            StatsRepository.getSalesByCategory(tenantId, filtro),
            conGraficaDiaria ? StatsRepository.getDailySalesRange(tenantId, firstDay, lastDayStr) : [],
            StatsRepository.getTotalsByPaymentMethod(tenantId, filtro),
            StatsRepository.getSalesByPaymentMethod(tenantId, filtro)
        ]);
        return { totalMes, facturasMes, topProductos, porCategoria, ventasDiarias, pagos, porMedio };
    }

    /** Gráfica de ventas por cada día del mes (misma serie que el dashboard). */
    static ventasDiariasSection(ventasDiarias) {
        if (!ventasDiarias || ventasDiarias.length === 0) {
            return [];
        }
        return [
            sectionTitle('Ventas por Día', COLOR_REPORTE),
            { svg: PdfCharts.ventasDiariasSvg(ventasDiarias, { color: COLOR_REPORTE }), width: 515 }
        ];
    }

    /** Dona + leyenda de métodos de pago (efectivo / transferencia / servicios externos). */
    static metodosPagoSection(pagos) {
        if (!pagos) {
            return [];
        }
        const segmentos = [
            { label: 'Efectivo', value: pagos.efectivo || 0, color: COLOR_REPORTE },
            { label: 'Transferencia', value: pagos.transferencia || 0, color: '#9aa7bd' },
            { label: 'Servicios Ext.', value: pagos.serviciosExternos || 0, color: '#e8431f' }
        ];
        const total = segmentos.reduce((s, seg) => s + seg.value, 0);
        const porcentaje = v => (total ? `${((v / total) * 100).toFixed(1).replace('.', ',')}%` : '0%');

        const leyenda = segmentos.map(seg => [
            { canvas: [{ type: 'rect', x: 0, y: 1, w: 9, h: 9, color: seg.color }], width: 9 },
            { text: seg.label, fontSize: 9, bold: true, width: 85 },
            { text: formatMoney(seg.value), fontSize: 9, alignment: 'right', width: 80 },
            { text: porcentaje(seg.value), fontSize: 9, color: '#5b6b7e', alignment: 'right', width: 40 }
        ]);

        return [
            sectionTitle('Métodos de Pago', COLOR_REPORTE),
            {
                columns: [
                    { svg: PdfCharts.donaSvg(segmentos), width: 130 },
                    {
                        stack: leyenda.map(columns => ({ columns, columnGap: 8, margin: [0, 0, 0, 10] })),
                        margin: [20, 35, 0, 0]
                    }
                ]
            }
        ];
    }

    /** Barras de ventas por categoría (mismo gráfico que el dashboard). */
    static categoriasChartSection(porCategoria) {
        if (!porCategoria || porCategoria.length === 0) {
            return [];
        }
        const items = porCategoria.map(c => ({
            etiqueta: c.categoria_nombre || 'Sin categoría',
            valor: Number(c.total_ventas) || 0
        }));
        return [{ svg: PdfCharts.barrasSvg(items, { color: COLOR_REPORTE }), width: 515, margin: [0, 0, 0, 10] }];
    }

    /**
     * Arma el docDefinition de pdfmake con las estadísticas del mes.
     */
    static buildDocDefinition(tenant, mesNombre, stats) {
        const { totalMes, facturasMes, topProductos, porCategoria, ventasDiarias, pagos, porMedio } = stats;
        const mes = mesNombre.toUpperCase();

        return {
            content: [
                ...encabezadoMarca(tenant.nombre, `Reporte de Ventas - ${mes}`),
                {
                    columns: [
                        statCard('Total Ingresos Brutos', formatMoney(totalMes), { valueColor: '#28a745' }),
                        statCard('Total Facturas/Pedidos', String(facturasMes), { valueColor: '#28a745' })
                    ],
                    columnGap: 16,
                    margin: [0, 0, 0, 10]
                },
                ...this.ventasDiariasSection(ventasDiarias),
                ...this.metodosPagoSection(pagos),
                sectionTitle('Facturas por Medio de Pago', COLOR_REPORTE),
                medioPagoTable(porMedio),
                sectionTitle('Top 5 Productos más Vendidos', COLOR_REPORTE),
                productosTable(topProductos),
                sectionTitle('Ventas por Categoría', COLOR_REPORTE),
                ...this.categoriasChartSection(porCategoria),
                categoriaTable(porCategoria),
                footerText('Este reporte fue generado de forma automática.')
            ]
        };
    }

    /**
     * Genera el PDF del reporte mensual (pdfmake, sin Chromium).
     */
    static async generarPdfReporte(tenant, mesNombre, stats) {
        const docDefinition = this.buildDocDefinition(tenant, mesNombre, stats);
        return PdfMaker.renderPdf(docDefinition);
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
        const rango = options.historico
            ? await this.calcularRangoHistorico(tenant.id)
            : this.calcularRangoFechas(options);
        console.log(`Generando reporte para ${tenant.nombre} - Rango: ${rango.firstDay} a ${rango.lastDayStr}...`);

        const stats = await this.obtenerEstadisticas(tenant.id, rango);
        const pdfBuffer = await this.generarPdfReporte(tenant, rango.mesNombre, stats);
        const to = this.obtenerEmailDestinatario(tenant, options);

        const mesUpper = rango.mesNombre.toUpperCase();
        const subject = `${options.historico ? 'Reporte Histórico' : 'Reporte Mensual'} - ${tenant.nombre} - ${mesUpper}`;
        const bodyContent = `Hola,<br><br>Adjunto enviamos el reporte de resumen de ventas de <strong>${mesUpper}</strong> para <strong>${tenant.nombre}</strong>.<br><br>Saludos cordiales,<br>Tu Sistema GastroFlow`;

        try {
            const mailResult = await MailerService.sendMail({
                to,
                subject,
                html: bodyContent,
                attachments: [
                    {
                        filename: `Reporte_${(options.historico ? 'HISTORICO' : mesUpper).replaceAll(' ', '_')}_${tenant.nombre.replaceAll(' ', '_')}.pdf`,
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
