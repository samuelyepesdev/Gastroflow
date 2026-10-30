/**
 * PdfMaker - Genera PDFs a partir de un docDefinition de pdfmake.
 *
 * Reemplaza a PdfBrowser.js (Chromium headless vía Puppeteer). Los 3 reportes
 * que consumían PdfBrowser son texto/tablas (sin imágenes ni logos), así que no
 * hace falta un motor de renderizado HTML completo -- eso es lo que costaba la
 * RAM (un Chromium por PDF). Las gráficas van como SVG inline (`{ svg }`, ver
 * PdfCharts.js), que pdfmake dibuja de forma nativa.
 *
 * Tipografía de marca (Cloche): Poppins para texto y Montserrat para títulos, desde
 * assets/fonts/ (licencia OFL). Se registran una sola vez de forma perezosa, la
 * primera vez que se pide un PDF.
 */

const path = require('node:path');

let pdfMakeInstance = null;

function getPdfMake() {
    if (pdfMakeInstance) {
        return pdfMakeInstance;
    }

    // Lazy: igual que PdfBrowser con puppeteer, no cargar el módulo hasta que
    // de verdad se genere un PDF.
    const pdfMake = require('pdfmake');
    const fontsDir = path.join(__dirname, '..', '..', 'assets', 'fonts');

    pdfMake.setFonts({
        Poppins: {
            normal: path.join(fontsDir, 'Poppins-Regular.ttf'),
            bold: path.join(fontsDir, 'Poppins-Medium.ttf'),
            italics: path.join(fontsDir, 'Poppins-Italic.ttf'),
            bolditalics: path.join(fontsDir, 'Poppins-MediumItalic.ttf')
        },
        Montserrat: {
            normal: path.join(fontsDir, 'Montserrat-SemiBold.ttf'),
            bold: path.join(fontsDir, 'Montserrat-Bold.ttf'),
            italics: path.join(fontsDir, 'Montserrat-SemiBold.ttf'),
            bolditalics: path.join(fontsDir, 'Montserrat-Bold.ttf')
        }
    });
    // Los docDefinition de estos reportes no referencian imágenes ni archivos
    // externos -- se deniega cualquier acceso a disco/red salvo el de las
    // propias fuentes de marca (la carga de fuentes pasa por esta misma política).
    pdfMake.setUrlAccessPolicy(() => false);
    pdfMake.setLocalAccessPolicy(filePath => path.resolve(filePath).startsWith(fontsDir));

    pdfMakeInstance = pdfMake;
    return pdfMakeInstance;
}

/**
 * @param {object} docDefinition  Documento pdfmake (content, styles, etc.).
 * @returns {Promise<Buffer>}
 */
async function renderPdf(docDefinition) {
    const pdfMake = getPdfMake();
    const doc = pdfMake.createPdf({
        pageSize: 'A4',
        pageMargins: [40, 40, 40, 40],
        defaultStyle: { font: 'Poppins', fontSize: 10, color: '#0e1b2c' },
        ...docDefinition
    });
    return doc.getBuffer();
}

module.exports = { renderPdf };
