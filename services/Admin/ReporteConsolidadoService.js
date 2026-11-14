const PdfMaker = require('../Shared/PdfMaker');
const {
    formatMoney,
    capitalize,
    statCard,
    sectionTitle,
    footerText,
    productosTable,
    categoriaTable,
    zebraTableLayout,
    tableHeaderCell,
    tableCell,
    emptyRow,
    medioPagoTable,
    encabezadoMarca
} = require('../Shared/PdfDocHelpers');
const TenantService = require('./TenantService');
const StatsRepository = require('../../repositories/Tenant/StatsRepository');
// Mismas secciones gráficas (dona de pagos, ventas diarias, barras por categoría) que el
// reporte descargable de cada tenant, para que ambos PDF no se desfasen.
const ReporteMensualService = require('../Tenant/ReporteMensualService');
const { hoyColombia } = require('../../utils/dateHelpers');

// Por encima de este rango la línea diaria ya no se lee bien: se omite.
const MAX_DIAS_GRAFICA_DIARIA = 62;

function diasEntre(desde, hasta) {
    const [y1, m1, d1] = desde.split('-').map(Number);
    const [y2, m2, d2] = hasta.split('-').map(Number);
    return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000) + 1;
}

/** Suma las filas de getSalesByPaymentMethod de varios tenants por forma_pago. */
function sumarMedios(listas) {
    const mapa = new Map();
    for (const lista of listas) {
        for (const r of lista || []) {
            const clave = r.forma_pago || '';
            const actual = mapa.get(clave) || { forma_pago: clave, cantidad: 0, total: 0 };
            actual.cantidad += Number(r.cantidad) || 0;
            actual.total += Number(r.total) || 0;
            mapa.set(clave, actual);
        }
    }
    return [...mapa.values()];
}

/**
 * Interpreta flags que llegan como string desde query params ('1'/'0', 'true'/'false')
 * o ya como boolean (cuando se invoca el servicio directamente).
 */
function toBool(value, defaultValue) {
    if (value === undefined || value === null || value === '') {
        return defaultValue;
    }
    return value === true || value === '1' || value === 'true';
}

/** Página de portada: stats globales, total por mes (rango multi-mes) y resumen por restaurante. */
function buildCoverContent(mes, totals, activeTenantsData, ventasPorMes) {
    const content = [
        ...encabezadoMarca('Reporte Consolidado de Ventas', `Resumen de Operaciones · ${mes}`, { margenSubtitulo: 24 }),
        {
            columns: [
                statCard('Total Neto del Periodo', formatMoney(totals.totalSales), { valueColor: '#10b981' }),
                statCard('Total Facturas / Pedidos', String(totals.totalInvoices), { valueColor: '#e8431f' }),
                statCard('Restaurantes Evaluados', String(activeTenantsData.length), { valueColor: '#e8431f' })
            ],
            columnGap: 12,
            margin: [0, 0, 0, 20]
        }
    ];

    if (ventasPorMes && ventasPorMes.length > 1) {
        const body = [
            [
                tableHeaderCell('Mes'),
                tableHeaderCell('Total Facturas', 'right'),
                tableHeaderCell('Ventas Totales', 'right')
            ]
        ];
        for (const vm of ventasPorMes) {
            body.push([
                tableCell(capitalize(vm.nombreMes)),
                tableCell(vm.facturas, 'right'),
                tableCell(formatMoney(vm.total), 'right', { bold: true })
            ]);
        }
        body.push([
            { text: 'Total Neto', bold: true, fontSize: 9, fillColor: '#fff0eb' },
            { text: String(totals.totalInvoices), bold: true, fontSize: 9, alignment: 'right', fillColor: '#fff0eb' },
            { text: formatMoney(totals.totalSales), bold: true, fontSize: 9, alignment: 'right', fillColor: '#fff0eb' }
        ]);
        content.push(sectionTitle('Total por Mes', '#e8431f'));
        content.push({
            table: { headerRows: 1, widths: ['*', 'auto', 'auto'], body },
            layout: zebraTableLayout(),
            margin: [0, 0, 0, 20]
        });
    }

    const rBody = [
        [
            tableHeaderCell('Restaurante'),
            tableHeaderCell('Slug'),
            tableHeaderCell('Plan Contratado'),
            tableHeaderCell('Total Facturas', 'right'),
            tableHeaderCell('Ventas Totales (Bruto)', 'right')
        ]
    ];
    if (activeTenantsData.length > 0) {
        for (const d of activeTenantsData) {
            rBody.push([
                tableCell(d.tenant.nombre, 'left', { bold: true }),
                tableCell(d.tenant.slug),
                tableCell(d.tenant.plan_nombre || 'Sin Plan'),
                tableCell(d.facturasMes, 'right'),
                tableCell(formatMoney(d.totalMes), 'right', { bold: true })
            ]);
        }
    } else {
        rBody.push(emptyRow('No hay restaurantes registrados o activos.', 5));
    }
    content.push(sectionTitle('Resumen de Rendimiento por Restaurante', '#e8431f'));
    content.push({
        table: { headerRows: 1, widths: ['*', 'auto', 'auto', 'auto', 'auto'], body: rBody },
        layout: zebraTableLayout()
    });

    // Medios de pago de todo el periodo (suma de todos los restaurantes incluidos)
    const porMedioGlobal = sumarMedios(activeTenantsData.map(d => d.porMedio));
    content.push(sectionTitle('Facturas por Medio de Pago (global)', '#e8431f'));
    content.push(medioPagoTable(porMedioGlobal));
    content.push(
        footerText('Este reporte consolidado fue generado de forma automática por el panel de administración.')
    );

    return content;
}

/** Bloque de detalle de un tenant (siempre empieza en página nueva). */
function buildTenantSectionContent(d, mes, mostrarTopProductos) {
    const content = [
        {
            columns: [
                {
                    text: [
                        { text: `${d.tenant.nombre}\n`, fontSize: 16, bold: true, color: '#10b981' },
                        { text: `Reporte Detallado · ${mes}`, fontSize: 9, color: '#5b6b7e' }
                    ]
                },
                {
                    text: `Slug: ${d.tenant.slug}\nPlan: ${d.tenant.plan_nombre || 'Sin Plan'}`,
                    fontSize: 8,
                    color: '#8a97a8',
                    alignment: 'right'
                }
            ],
            pageBreak: 'before',
            margin: [0, 0, 0, 16]
        }
    ];

    if (d.error) {
        content.push({
            text: `Error al recuperar datos: ${d.error}`,
            color: '#991b1b',
            fillColor: '#fef2f2',
            fontSize: 9,
            margin: [0, 0, 0, 16]
        });
        content.push(footerText(`Reporte mensual de rendimiento para ${d.tenant.nombre}.`));
        return content;
    }

    content.push({
        columns: [
            statCard('Total Ingresos Brutos', formatMoney(d.totalMes), { valueColor: '#15803d' }),
            statCard('Total Facturas/Pedidos', String(d.facturasMes), { valueColor: '#15803d' })
        ],
        columnGap: 12,
        margin: [0, 0, 0, 12]
    });

    content.push(...ReporteMensualService.ventasDiariasSection(d.ventasDiarias));
    content.push(...ReporteMensualService.metodosPagoSection(d.pagos));
    content.push(sectionTitle('Facturas por Medio de Pago', '#10b981'));
    content.push(medioPagoTable(d.porMedio));

    if (mostrarTopProductos) {
        content.push(sectionTitle('Top 5 Productos más Vendidos', '#10b981'));
        content.push(productosTable(d.topProductos));
    }

    content.push(sectionTitle('Ventas por Categoría', '#10b981'));
    content.push(...ReporteMensualService.categoriasChartSection(d.porCategoria));
    content.push(categoriaTable(d.porCategoria));

    if (d.desglosePorMes && d.desglosePorMes.length > 0) {
        content.push(sectionTitle('Productos más Vendidos por Mes', '#10b981'));
        for (const dm of d.desglosePorMes) {
            content.push({
                text: capitalize(dm.nombreMes),
                fontSize: 9,
                bold: true,
                color: '#e8431f',
                fillColor: '#fff0eb',
                margin: [0, 8, 0, 4]
            });
            content.push(productosTable(dm.topProductos));
        }
    }

    content.push(footerText(`Reporte mensual de rendimiento para ${d.tenant.nombre}.`));
    return content;
}

// Restaurantes procesados a la vez: cada uno lanza ~5 consultas en paralelo; con 10 conexiones en el pool,
// 2 a la vez deja holgura para las ventas en vivo.
const TENANTS_EN_PARALELO = 2;

/** Mapea `items` con `fn` de a `tamano` a la vez, conservando el orden. */
async function enTandas(items, tamano, fn) {
    const resultados = [];
    for (let i = 0; i < items.length; i += tamano) {
        resultados.push(...(await Promise.all(items.slice(i, i + tamano).map(fn))));
    }
    return resultados;
}

class ReporteConsolidadoService {
    /**
     * Generates a consolidated PDF report, either for a single tenant or for all
     * active tenants, over a month range (mesDesde/anioDesde a mesHasta/anioHasta).
     * @param {Object} options
     * @param {number|string} [options.tenantId] - Id del tenant a exportar, o 'all'/omitido para todos los activos.
     * @param {number} options.mesDesde - Mes inicial (1-12)
     * @param {number} options.anioDesde - Año inicial
     * @param {number} [options.mesHasta] - Mes final (1-12), por defecto igual a mesDesde
     * @param {number} [options.anioHasta] - Año final, por defecto igual a anioDesde
     * @param {boolean} [options.historico] - Ignora el rango de meses y usa desde la primera venta hasta hoy (default false).
     * @param {boolean} [options.incluirResumenMensual] - Tabla "Total por Mes" en la portada. Solo aplica a un tenant específico (default true).
     * @param {boolean} [options.incluirTopProductos] - Tabla de productos más vendidos por restaurante (default true).
     * @param {boolean} [options.incluirDesglosePorMes] - Desglosa el top de productos mes a mes en vez de solo el total del rango. Solo aplica a un tenant específico (default false).
     * @returns {Promise<Buffer>} PDF Buffer
     */
    static async generarReporteConsolidado(options = {}) {
        const date = new Date();
        const historico = toBool(options.historico, false);

        // Obtener los tenants a incluir: uno específico, o todos los activos
        const allTenants = await TenantService.getAllTenants();
        const esEspecifico = !!(options.tenantId && options.tenantId !== 'all');
        let activeTenants;
        if (esEspecifico) {
            const tenant = (allTenants || []).find(t => Number(t.id) === Number(options.tenantId));
            if (!tenant) {
                throw new Error('Restaurante no encontrado.');
            }
            activeTenants = [tenant];
        } else {
            activeTenants = (allTenants || []).filter(t => t.activo);
        }

        let targetMesDesde = options.mesDesde ? parseInt(options.mesDesde, 10) : date.getMonth() + 1;
        let targetAnioDesde = options.anioDesde ? parseInt(options.anioDesde, 10) : date.getFullYear();
        let targetMesHasta = options.mesHasta ? parseInt(options.mesHasta, 10) : targetMesDesde;
        let targetAnioHasta = options.anioHasta ? parseInt(options.anioHasta, 10) : targetAnioDesde;

        if (historico) {
            // Desde la primera venta (la más antigua entre los restaurantes incluidos) hasta hoy.
            const primeras = await Promise.all(
                activeTenants.map(t => StatsRepository.getPrimeraFechaVenta(t.id).catch(() => null))
            );
            const hoy = hoyColombia();
            const primera = primeras.filter(Boolean).sort()[0] || hoy;
            const [yDesde, mDesde] = primera.split('-').map(Number);
            const [yHasta, mHasta] = hoy.split('-').map(Number);
            targetAnioDesde = yDesde;
            targetMesDesde = mDesde;
            targetAnioHasta = yHasta;
            targetMesHasta = mHasta;
        }

        // Validar que no sea una fecha en el futuro
        const requestDate = new Date(targetAnioHasta, targetMesHasta - 1, 1);
        if (requestDate > date) {
            throw new Error('No se puede generar un reporte de un mes futuro.');
        }
        if (new Date(targetAnioDesde, targetMesDesde - 1, 1) > new Date(targetAnioHasta, targetMesHasta - 1, 1)) {
            throw new Error('El periodo inicial no puede ser posterior al periodo final.');
        }

        const firstDay = `${targetAnioDesde}-${targetMesDesde.toString().padStart(2, '0')}-01`;
        const lastDayStr = `${targetAnioHasta}-${targetMesHasta.toString().padStart(2, '0')}-${new Date(targetAnioHasta, targetMesHasta, 0).getDate()}`;

        // Nombre del periodo en español (un solo mes, o rango "Enero 2026 - Marzo 2026")
        const desdeNombre = new Date(targetAnioDesde, targetMesDesde - 1, 1).toLocaleString('es-CO', {
            month: 'long',
            year: 'numeric'
        });
        const mismoMes = targetMesDesde === targetMesHasta && targetAnioDesde === targetAnioHasta;
        let mesNombre = mismoMes
            ? desdeNombre
            : `${desdeNombre} - ${new Date(targetAnioHasta, targetMesHasta - 1, 1).toLocaleString('es-CO', { month: 'long', year: 'numeric' })}`;
        if (historico) {
            mesNombre = `Desde el inicio (${mesNombre})`;
        }

        console.log(
            `[CONSOLIDADO]: Generando reporte consolidado para ${mesNombre.toUpperCase()} (Rango: ${firstDay} a ${lastDayStr}, tenant: ${options.tenantId || 'all'})`
        );
        const conGraficaDiaria = diasEntre(firstDay, lastDayStr) <= MAX_DIAS_GRAFICA_DIARIA;

        // El desglose (resumen mensual, top de productos, desglose mes a mes) solo tiene
        // sentido cuando se exporta un restaurante específico -- el consolidado de "todos"
        // siempre trae el contenido completo, tal como antes.
        const incluirResumenMensual = esEspecifico ? toBool(options.incluirResumenMensual, true) : true;
        const incluirTopProductos = esEspecifico ? toBool(options.incluirTopProductos, true) : true;
        const incluirDesglosePorMes =
            esEspecifico && incluirTopProductos ? toBool(options.incluirDesglosePorMes, false) : false;

        // Ventas y facturas de TODOS los restaurantes por mes en UNA consulta agrupada (antes: 2 consultas
        // por restaurante para el total del rango + 2 por restaurante y por mes para el resumen mensual).
        // Si falla, el reporte falla: unos totales en 0 en un PDF financiero serían peor que un error.
        const ventasAgrupadas = await StatsRepository.getVentasPorTenantYMes(
            activeTenants.map(t => t.id),
            firstDay,
            lastDayStr
        );
        const totalesPorTenant = new Map();
        const totalesPorMes = new Map();
        for (const fila of ventasAgrupadas) {
            const t = totalesPorTenant.get(fila.tenant_id) || { total: 0, cantidad: 0 };
            t.total += fila.total;
            t.cantidad += fila.cantidad;
            totalesPorTenant.set(fila.tenant_id, t);
            const m = totalesPorMes.get(fila.mes) || { total: 0, cantidad: 0 };
            m.total += fila.total;
            m.cantidad += fila.cantidad;
            totalesPorMes.set(fila.mes, m);
        }

        // Los restaurantes se procesan en tandas pequeñas: cada uno lanza varias consultas en paralelo y
        // todos a la vez (N x 5) acaparaban las 10 conexiones del pool, dejando sin servicio a la caja.
        const activeTenantsData = await enTandas(activeTenants, TENANTS_EN_PARALELO, async tenant => {
            try {
                const filtro = { desde: firstDay, hasta: lastDayStr };
                const { total: totalMes = 0, cantidad: facturasMes = 0 } =
                    totalesPorTenant.get(Number(tenant.id)) || {};
                const [topProductos, porCategoria, pagos, porMedio, ventasDiarias] = await Promise.all([
                    incluirTopProductos ? StatsRepository.getTopProducts(tenant.id, 5, filtro) : [],
                    StatsRepository.getSalesByCategory(tenant.id, filtro),
                    StatsRepository.getTotalsByPaymentMethod(tenant.id, filtro),
                    StatsRepository.getSalesByPaymentMethod(tenant.id, filtro),
                    conGraficaDiaria ? StatsRepository.getDailySalesRange(tenant.id, firstDay, lastDayStr) : []
                ]);

                return {
                    tenant,
                    totalMes,
                    facturasMes,
                    topProductos,
                    porCategoria,
                    pagos,
                    porMedio,
                    ventasDiarias
                };
            } catch (err) {
                console.error(
                    `[CONSOLIDADO_ERROR] Error obteniendo estadísticas para tenant ${tenant.nombre}:`,
                    err.message
                );
                // Si falla un tenant individual, lo agregamos con datos vacíos para no romper todo el reporte consolidado
                return {
                    tenant,
                    totalMes: 0,
                    facturasMes: 0,
                    topProductos: [],
                    porCategoria: [],
                    pagos: null,
                    porMedio: [],
                    ventasDiarias: [],
                    error: err.message
                };
            }
        });

        let globalTotalSales = 0;
        let globalTotalInvoices = 0;
        for (const tenantData of activeTenantsData) {
            globalTotalSales += tenantData.totalMes;
            globalTotalInvoices += tenantData.facturasMes;
        }

        // Desglose por mes calendario dentro del rango (solo aporta valor cuando el
        // rango cubre más de un mes; con 1 mes coincide con el total ya calculado).
        const mesesEnRango = [];
        {
            let y = targetAnioDesde;
            let m = targetMesDesde;
            while (y < targetAnioHasta || (y === targetAnioHasta && m <= targetMesHasta)) {
                mesesEnRango.push({ anio: y, mes: m });
                m += 1;
                if (m > 12) {
                    m = 1;
                    y += 1;
                }
            }
        }

        const ventasPorMes =
            incluirResumenMensual && mesesEnRango.length > 1
                ? mesesEnRango.map(({ anio, mes }) => {
                      const { total = 0, cantidad: facturas = 0 } =
                          totalesPorMes.get(`${anio}-${mes.toString().padStart(2, '0')}`) || {};
                      const nombreMes = new Date(anio, mes - 1, 1).toLocaleString('es-CO', {
                          month: 'long',
                          year: 'numeric'
                      });
                      return { nombreMes, total, facturas };
                  })
                : [];

        // Desglose de productos más vendidos mes a mes (solo tenant específico): repite
        // el top 5 + ventas por categoría para cada mes del rango, en vez de un solo
        // agregado. Se calcula sobre el (único) tenant en activeTenants.
        if (incluirDesglosePorMes && mesesEnRango.length > 1) {
            const tenant = activeTenants[0];
            const desglosePorMes = await Promise.all(
                mesesEnRango.map(async ({ anio, mes }) => {
                    const desde = `${anio}-${mes.toString().padStart(2, '0')}-01`;
                    const hasta = `${anio}-${mes.toString().padStart(2, '0')}-${new Date(anio, mes, 0).getDate()}`;
                    const nombreMes = new Date(anio, mes - 1, 1).toLocaleString('es-CO', {
                        month: 'long',
                        year: 'numeric'
                    });
                    try {
                        const [topProductos, porCategoria] = await Promise.all([
                            StatsRepository.getTopProducts(tenant.id, 5, { desde, hasta }),
                            StatsRepository.getSalesByCategory(tenant.id, { desde, hasta })
                        ]);
                        return { nombreMes, topProductos, porCategoria };
                    } catch (err) {
                        console.error(
                            `[CONSOLIDADO_ERROR] Error obteniendo desglose mensual para tenant ${tenant.nombre} (${nombreMes}):`,
                            err.message
                        );
                        return { nombreMes, topProductos: [], porCategoria: [] };
                    }
                })
            );
            activeTenantsData[0].desglosePorMes = desglosePorMes;
        }

        const mes = mesNombre.toUpperCase();
        const totals = { totalSales: globalTotalSales, totalInvoices: globalTotalInvoices };

        const docDefinition = {
            content: [
                ...buildCoverContent(mes, totals, activeTenantsData, ventasPorMes),
                ...activeTenantsData.flatMap(d => buildTenantSectionContent(d, mes, incluirTopProductos))
            ]
        };

        try {
            return await PdfMaker.renderPdf(docDefinition);
        } catch (pdfError) {
            console.error('[CONSOLIDADO_PDF_EXPORT_ERROR]:', pdfError);
            throw pdfError;
        }
    }
}

module.exports = ReporteConsolidadoService;
