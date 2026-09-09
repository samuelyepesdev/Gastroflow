const ejs = require('ejs');
const path = require('path');
const { renderPdf } = require('../Shared/PdfBrowser');
const TenantService = require('./TenantService');
const StatsRepository = require('../../repositories/Tenant/StatsRepository');

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
     * Generates a consolidated PDF report, either for a single tenant or for all
     * active tenants, over a month range (mesDesde/anioDesde a mesHasta/anioHasta).
     * @param {Object} options
     * @param {number|string} [options.tenantId] - Id del tenant a exportar, o 'all'/omitido para todos los activos.
     * @param {number} options.mesDesde - Mes inicial (1-12)
     * @param {number} options.anioDesde - Año inicial
     * @param {number} [options.mesHasta] - Mes final (1-12), por defecto igual a mesDesde
     * @param {number} [options.anioHasta] - Año final, por defecto igual a anioDesde
     * @param {boolean} [options.incluirResumenMensual] - Tabla "Total por Mes" en la portada. Solo aplica a un tenant específico (default true).
     * @param {boolean} [options.incluirTopProductos] - Tabla de productos más vendidos por restaurante (default true).
     * @param {boolean} [options.incluirDesglosePorMes] - Desglosa el top de productos mes a mes en vez de solo el total del rango. Solo aplica a un tenant específico (default false).
     * @returns {Promise<Buffer>} PDF Buffer
     */
    static async generarReporteConsolidado(options = {}) {
        const date = new Date();
        const targetMesDesde = options.mesDesde ? parseInt(options.mesDesde, 10) : date.getMonth() + 1;
        const targetAnioDesde = options.anioDesde ? parseInt(options.anioDesde, 10) : date.getFullYear();
        const targetMesHasta = options.mesHasta ? parseInt(options.mesHasta, 10) : targetMesDesde;
        const targetAnioHasta = options.anioHasta ? parseInt(options.anioHasta, 10) : targetAnioDesde;

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
        const mesNombre = mismoMes
            ? desdeNombre
            : `${desdeNombre} - ${new Date(targetAnioHasta, targetMesHasta - 1, 1).toLocaleString('es-CO', { month: 'long', year: 'numeric' })}`;

        console.log(
            `[CONSOLIDADO]: Generando reporte consolidado para ${mesNombre.toUpperCase()} (Rango: ${firstDay} a ${lastDayStr}, tenant: ${options.tenantId || 'all'})`
        );

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

        // El desglose (resumen mensual, top de productos, desglose mes a mes) solo tiene
        // sentido cuando se exporta un restaurante específico -- el consolidado de "todos"
        // siempre trae el contenido completo, tal como antes.
        const incluirResumenMensual = esEspecifico ? toBool(options.incluirResumenMensual, true) : true;
        const incluirTopProductos = esEspecifico ? toBool(options.incluirTopProductos, true) : true;
        const incluirDesglosePorMes =
            esEspecifico && incluirTopProductos ? toBool(options.incluirDesglosePorMes, false) : false;

        // Un tenant es independiente de otro: se resuelven en paralelo en vez de
        // secuencial (antes eran 4 awaits × N tenants en serie).
        const activeTenantsData = await Promise.all(
            activeTenants.map(async tenant => {
                try {
                    const [totalMes, facturasMes, topProductos, porCategoria] = await Promise.all([
                        StatsRepository.getTotalSales(tenant.id, { desde: firstDay, hasta: lastDayStr }),
                        StatsRepository.getTotalInvoices(tenant.id, { desde: firstDay, hasta: lastDayStr }),
                        incluirTopProductos
                            ? StatsRepository.getTopProducts(tenant.id, 5, { desde: firstDay, hasta: lastDayStr })
                            : [],
                        StatsRepository.getSalesByCategory(tenant.id, { desde: firstDay, hasta: lastDayStr })
                    ]);

                    return { tenant, totalMes, facturasMes, topProductos, porCategoria };
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
                        error: err.message
                    };
                }
            })
        );

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
                ? await Promise.all(
                      mesesEnRango.map(async ({ anio, mes }) => {
                          const desde = `${anio}-${mes.toString().padStart(2, '0')}-01`;
                          const hasta = `${anio}-${mes.toString().padStart(2, '0')}-${new Date(anio, mes, 0).getDate()}`;
                          const porTenant = await Promise.all(
                              activeTenants.map(t =>
                                  Promise.all([
                                      StatsRepository.getTotalSales(t.id, { desde, hasta }),
                                      StatsRepository.getTotalInvoices(t.id, { desde, hasta })
                                  ]).catch(() => [0, 0])
                              )
                          );
                          const total = porTenant.reduce((sum, [ventas]) => sum + ventas, 0);
                          const facturas = porTenant.reduce((sum, [, fact]) => sum + fact, 0);
                          const nombreMes = new Date(anio, mes - 1, 1).toLocaleString('es-CO', {
                              month: 'long',
                              year: 'numeric'
                          });
                          return { nombreMes, total, facturas };
                      })
                  )
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

        const templatePath = path.join(__dirname, '../../views/admin/reportes/consolidado_pdf.ejs');
        const data = {
            mes: mesNombre.toUpperCase(),
            activeTenantsData,
            ventasPorMes,
            mostrarTopProductos: incluirTopProductos,
            totals: {
                totalSales: globalTotalSales,
                totalInvoices: globalTotalInvoices
            },
            formatMoney
        };

        const html = await ejs.renderFile(templatePath, data);

        try {
            return await renderPdf(
                html,
                {
                    format: 'A4',
                    printBackground: true,
                    margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' }
                },
                { waitUntil: 'networkidle0' }
            );
        } catch (puppeteerError) {
            console.error('[CONSOLIDADO_PDF_EXPORT_ERROR]:', puppeteerError);
            throw puppeteerError;
        }
    }
}

module.exports = ReporteConsolidadoService;
