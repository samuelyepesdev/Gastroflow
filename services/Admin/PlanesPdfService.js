/**
 * PlanesPdfService - Genera el PDF de portafolio de planes.
 * Extraído de PlanesController.exportPdf para poder llamarlo tanto desde el
 * controller (compatibilidad) como desde JobWorkerService (generación async).
 *
 * El render (docDefinition -> Buffer, sin Chromium) vive en
 * services/Shared/PdfMaker.js.
 */

const PdfMaker = require('../Shared/PdfMaker');
const PlanService = require('./PlanService');
const { TODOS_LOS_MODULOS } = require('../../utils/planPermissions');

const BANNER_COLORS = { basico: '#475569', pro: '#1d4ed8', premium: '#6d28d9' };

function humanizeFeature(feat) {
    if (feat === TODOS_LOS_MODULOS) {
        return 'Todos los módulos, incluidos los nuevos';
    }
    return feat
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function planCard(plan) {
    const bannerColor = BANNER_COLORS[plan.slug] || BANNER_COLORS.basico;
    // Nota: '✓' no existe en el charset de Roboto (glifo faltante -> tofu), se usa
    // un bullet de color como check visual en su lugar.
    const featureItems = (plan.caracteristicas || []).map(f => ({
        text: [{ text: '• ', color: '#10b981', bold: true }, { text: humanizeFeature(f) }],
        fontSize: 9,
        margin: [0, 0, 0, 4]
    }));
    const half = Math.ceil(featureItems.length / 2);

    const body = [
        {
            table: {
                widths: ['*', 'auto'],
                body: [
                    [
                        { text: `Plan ${plan.nombre}`, color: 'white', bold: true, fontSize: 14 },
                        { text: plan.slug.toUpperCase(), color: 'white', fontSize: 9, alignment: 'right' }
                    ]
                ]
            },
            layout: {
                hLineWidth: () => 0,
                vLineWidth: () => 0,
                fillColor: () => bannerColor,
                paddingLeft: () => 14,
                paddingRight: () => 14,
                paddingTop: () => 10,
                paddingBottom: () => 10
            }
        },
        { text: 'Nuestra Propuesta', style: 'cardSectionTitle', margin: [10, 12, 10, 4] },
        { text: plan.descripcion || '', fontSize: 9, color: '#475569', margin: [10, 0, 10, 8] }
    ];

    if (plan.descripcion_detallada) {
        body.push({
            text: plan.descripcion_detallada,
            fontSize: 8,
            italics: true,
            color: '#64748b',
            fillColor: '#f1f5f9',
            margin: [10, 0, 10, 10]
        });
    }

    body.push({ text: '¿Qué incluye?', style: 'cardSectionTitle', margin: [10, 4, 10, 6] });
    body.push({
        columns: [
            { stack: featureItems.slice(0, half), width: '*' },
            { stack: featureItems.slice(half), width: '*' }
        ],
        margin: [10, 0, 10, 10]
    });

    body.push({
        table: {
            widths: ['*', '*', '*'],
            body: [
                [
                    { text: 'PEQUEÑO', fontSize: 8, bold: true, color: '#64748b', alignment: 'center' },
                    { text: 'MEDIANO', fontSize: 8, bold: true, color: '#64748b', alignment: 'center' },
                    { text: 'GRANDE', fontSize: 8, bold: true, color: '#64748b', alignment: 'center' }
                ],
                [
                    {
                        text: `$${Number(plan.precio_pequeno).toLocaleString('es-CO')}`,
                        bold: true,
                        fontSize: 13,
                        alignment: 'center'
                    },
                    {
                        text: `$${Number(plan.precio_mediano).toLocaleString('es-CO')}`,
                        bold: true,
                        fontSize: 13,
                        alignment: 'center'
                    },
                    {
                        text: `$${Number(plan.precio_grande).toLocaleString('es-CO')}`,
                        bold: true,
                        fontSize: 13,
                        alignment: 'center'
                    }
                ]
            ]
        },
        layout: {
            hLineWidth: () => 0.5,
            vLineWidth: i => (i === 1 || i === 2 ? 0.5 : 0),
            hLineColor: () => '#e2e8f0',
            vLineColor: () => '#e2e8f0',
            fillColor: () => '#f8fafc'
        },
        margin: [10, 0, 10, 10]
    });

    return { stack: body, unbreakable: true, margin: [0, 0, 0, 20] };
}

class PlanesPdfService {
    /**
     * @returns {Promise<Buffer>} PDF Buffer
     */
    static async generarPortafolioPdf() {
        const plans = await PlanService.getAll();

        const docDefinition = {
            pageMargins: [40, 50, 40, 40],
            styles: { cardSectionTitle: { fontSize: 10, bold: true, color: '#4f46e5' } },
            content: [
                { text: 'GastroFlow Portafolio', alignment: 'center', fontSize: 22, bold: true, color: '#4f46e5' },
                {
                    text: 'Transformando la gestión de tu restaurante con inteligencia',
                    alignment: 'center',
                    fontSize: 11,
                    color: '#64748b',
                    margin: [0, 4, 0, 24]
                },
                ...(plans || []).map(planCard),
                {
                    text: `GastroFlow SAS © ${new Date().getFullYear()} - Portafolio Oficial de Servicios Gastronómicos`,
                    alignment: 'center',
                    fontSize: 8,
                    color: '#94a3b8',
                    margin: [0, 10, 0, 0]
                },
                {
                    text: `Generado el ${new Date().toLocaleDateString('es-CO')}`,
                    alignment: 'center',
                    fontSize: 8,
                    color: '#94a3b8'
                }
            ]
        };

        return PdfMaker.renderPdf(docDefinition);
    }
}

module.exports = PlanesPdfService;
