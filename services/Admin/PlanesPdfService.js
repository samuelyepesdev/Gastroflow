/**
 * PlanesPdfService - Genera el PDF de portafolio de planes (puppeteer).
 * Extraído de PlanesController.exportPdf para poder llamarlo tanto desde el
 * controller (compatibilidad) como desde JobWorkerService (generación async).
 */

const ejs = require('ejs');
const path = require('path');
const puppeteer = require('puppeteer');
const PlanService = require('./PlanService');

class PlanesPdfService {
    /**
     * @returns {Promise<Buffer>} PDF Buffer
     */
    static async generarPortafolioPdf() {
        const plans = await PlanService.getAll();
        const templatePath = path.join(__dirname, '../../views/admin/planes/pdf_export.ejs');
        const html = await ejs.renderFile(templatePath, { plans });

        let browser = null;
        try {
            browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
            });
            const page = await browser.newPage();
            await page.setContent(html, { waitUntil: 'load', timeout: 30000 });

            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' }
            });

            await browser.close();
            return pdfBuffer;
        } catch (error) {
            if (browser) {
                try {
                    await browser.close();
                } catch (_e) {
                    /* intentional */
                }
            }
            throw error;
        }
    }
}

module.exports = PlanesPdfService;
