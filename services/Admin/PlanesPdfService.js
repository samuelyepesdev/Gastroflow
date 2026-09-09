/**
 * PlanesPdfService - Genera el PDF de portafolio de planes.
 * Extraído de PlanesController.exportPdf para poder llamarlo tanto desde el
 * controller (compatibilidad) como desde JobWorkerService (generación async).
 *
 * El render (Chromium headless de un solo uso + cierre garantizado + watchdog)
 * vive en services/Shared/PdfBrowser.js.
 */

const ejs = require('ejs');
const path = require('path');
const { renderPdf } = require('../Shared/PdfBrowser');
const PlanService = require('./PlanService');

class PlanesPdfService {
    /**
     * @returns {Promise<Buffer>} PDF Buffer
     */
    static async generarPortafolioPdf() {
        const plans = await PlanService.getAll();
        const templatePath = path.join(__dirname, '../../views/admin/planes/pdf_export.ejs');
        const html = await ejs.renderFile(templatePath, { plans });

        return renderPdf(html, {
            format: 'A4',
            printBackground: true,
            margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' }
        });
    }
}

module.exports = PlanesPdfService;
