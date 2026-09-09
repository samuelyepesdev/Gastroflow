/**
 * PdfBrowser - Renderiza HTML a PDF con un Chromium headless de un solo uso.
 *
 * Motivación: memoria (el 96% del costo del servidor es RAM). Cada servicio de
 * reporte hacía su propio `puppeteer.launch` con flags mínimos; un Chromium sin
 * `--disable-dev-shm-usage` / `--single-process` en un contenedor chico pasa
 * fácil de ~120 MB a ~300 MB. Además `require('puppeteer')` se hace acá adentro
 * (lazy) para no cargar el módulo -- ni dejarlo residente -- salvo que de verdad
 * se genere un PDF.
 *
 * Garantías:
 *  - El navegador SIEMPRE se cierra (o se mata con SIGKILL si `close()` cuelga).
 *  - Un watchdog aborta el render si tarda más de `timeoutMs` (default 45s).
 *  - Nunca se reutiliza un navegador entre llamadas (sin pool): un pico puntual
 *    de memoria es preferible a ~250 MB residentes todo el día.
 */

// Flags orientados a minimizar RAM en un Chromium de un solo uso.
// NOTA: `--single-process` bajaría más la RAM pero rompe page.pdf()
// ("Protocol error (Page.printToPDF): Target closed"), así que no se usa.
// `--disable-dev-shm-usage` es lo más importante en contenedores chicos.
const LAUNCH_ARGS = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-zygote',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-crash-reporter',
    '--disable-breakpad',
    '--mute-audio',
    '--no-first-run',
    '--js-flags=--max-old-space-size=160'
];

async function killBrowser(browser) {
    if (!browser) {
        return;
    }
    try {
        await browser.close();
    } catch (_e) {
        try {
            browser.process()?.kill('SIGKILL');
        } catch (_e2) {
            /* nada más que se pueda hacer */
        }
    }
}

/**
 * @param {string} html                    HTML completo a renderizar.
 * @param {object} [pdfOptions]            Opciones para page.pdf() (format, margin, printBackground...).
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=45000]  Corta el render (mata el navegador) si se pasa.
 * @param {string} [opts.waitUntil='load'] waitUntil de page.setContent().
 * @returns {Promise<Buffer>}
 */
async function renderPdf(html, pdfOptions = {}, opts = {}) {
    const timeoutMs = opts.timeoutMs || 45000;
    const waitUntil = opts.waitUntil || 'load';
    const pageTimeout = Math.min(timeoutMs, 30000);
    // Lazy: mantener puppeteer fuera del árbol de módulos residente mientras no se use.
    const puppeteer = require('puppeteer');

    let browser = null;
    let timedOut = false;
    const watchdog = setTimeout(() => {
        timedOut = true;
        killBrowser(browser); // si ya existe lo mata; corta cualquier operación colgada
    }, timeoutMs);

    try {
        browser = await puppeteer.launch({ headless: true, args: LAUNCH_ARGS });
        if (timedOut) {
            throw new Error(`Generación de PDF excedió ${timeoutMs}ms`);
        }

        const page = await browser.newPage();
        page.setDefaultTimeout(pageTimeout);
        await page.setContent(html, { waitUntil, timeout: pageTimeout });

        const buffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' },
            ...pdfOptions
        });
        if (timedOut) {
            throw new Error(`Generación de PDF excedió ${timeoutMs}ms`);
        }
        return buffer;
    } finally {
        clearTimeout(watchdog);
        await killBrowser(browser);
    }
}

module.exports = { renderPdf, LAUNCH_ARGS };
