/**
 * generate-og-image.js
 *
 * Genera public/og-image.jpg (1200x630, < 300 KB: WhatsApp descarta imagenes mas pesadas y muestra miniatura chica) usado en
 * las etiquetas Open Graph / Twitter Card de la landing
 * (views/landing/index.ejs). Usa el logo real del proyecto (public/logo.png)
 * como protagonista, con una paleta construida a partir de su propio azul
 * (~#1a4886, muestreado del PNG) en vez de forzar el verde de la landing,
 * que no combinaba con el logo.
 *
 * Uso: node scripts/generate-og-image.js
 * Volver a correr cada vez que cambie el logo o el mensaje de marca.
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const WIDTH = 1200;
const HEIGHT = 630;

// Azul propio del logo (muestreado directo de public/logo.png), no el verde
// de la landing -- este banner gira alrededor del logo real, no al revés.
const LOGO_BLUE = '#1a4886';
const LOGO_BLUE_LIGHT = '#5b8fd6';
const BACKGROUND = '#05070c';
const TEXT_MUTED = '#93a0b8';

const ICONS = {
    cash: '<rect x="2" y="6" width="20" height="12" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M6 6v12M18 6v12" stroke="currentColor" stroke-width="1.8"/>',
    box: '<path d="M21 8l-9-5-9 5 9 5 9-5z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/><path d="M3 8v8l9 5 9-5V8" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/><path d="M12 13v8" stroke="currentColor" stroke-width="1.8"/>',
    display:
        '<rect x="3" y="4" width="18" height="12" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M8 20h8M12 16v4" stroke="currentColor" stroke-width="1.8"/>',
    calculator:
        '<rect x="5" y="2" width="14" height="20" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M8 6h8M8 11h1M11.5 11h1M15 11h1M8 15h1M11.5 15h1M15 15h1M8 18.5h1M11.5 18.5h1M15 18.5h1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'
};

function iconSvg(name, size = 18) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24">${ICONS[name]}</svg>`;
}

function chip(name, label) {
    return `
    <div style="display:flex;align-items:center;gap:9px;padding:10px 16px;border-radius:12px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.1);">
      <span style="color:${LOGO_BLUE_LIGHT};display:flex;">${iconSvg(name, 17)}</span>
      <span style="font-size:14px;font-weight:600;color:#eef1f6;white-space:nowrap;">${label}</span>
    </div>`;
}

function logoDataUri() {
    const buf = fs.readFileSync(path.join(__dirname, '..', 'public', 'logo.png'));
    return `data:image/png;base64,${buf.toString('base64')}`;
}

function buildHtml() {
    const logoSrc = logoDataUri();

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
  body {
    background: ${BACKGROUND};
    font-family: 'Plus Jakarta Sans', 'Segoe UI', system-ui, sans-serif;
    position: relative;
  }
</style>
</head>
<body>

  <!-- glow azul detrás del logo, tomado del propio color del logo -->
  <div style="position:absolute;top:-120px;right:-160px;width:680px;height:680px;background:radial-gradient(circle,rgba(26,72,134,.55),transparent 68%);filter:blur(6px);border-radius:50%;"></div>
  <div style="position:absolute;bottom:-260px;left:-200px;width:560px;height:560px;background:radial-gradient(circle,rgba(26,72,134,.30),transparent 65%);filter:blur(6px);border-radius:50%;"></div>
  <div style="position:absolute;inset:0;background:linear-gradient(180deg,transparent 60%,rgba(0,0,0,.35));"></div>

  <div style="position:relative;z-index:2;width:100%;height:100%;padding:50px 60px;display:flex;flex-direction:column;justify-content:space-between;">

    <!-- marca -->
    <div style="display:flex;align-items:center;gap:13px;">
      <img src="${logoSrc}" width="44" height="44" style="border-radius:10px;display:block;">
      <span style="font-size:26px;font-weight:800;color:#fff;letter-spacing:-.5px;">GastroFlow</span>
    </div>

    <!-- contenido principal -->
    <div style="display:flex;align-items:center;justify-content:space-between;gap:40px;">
      <div style="max-width:600px;">
        <div style="display:inline-flex;align-items:center;gap:8px;background:rgba(26,72,134,.20);color:${LOGO_BLUE_LIGHT};border:1px solid rgba(91,143,214,.35);padding:7px 15px;border-radius:30px;font-size:13px;font-weight:700;margin-bottom:20px;">
          <span style="width:7px;height:7px;border-radius:50%;background:${LOGO_BLUE_LIGHT};"></span>
          El sistema operativo de tu cocina
        </div>
        <h1 style="font-size:46px;font-weight:800;line-height:1.15;color:#fff;letter-spacing:-1.1px;margin-bottom:18px;">
          Deja de adivinar.<br>Empieza a
          <span style="background:linear-gradient(120deg,${LOGO_BLUE_LIGHT},#cfe0f7);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;">controlar tu margen</span>.
        </h1>
        <p style="font-size:18px;line-height:1.55;color:${TEXT_MUTED};font-weight:500;max-width:520px;margin-bottom:24px;">
          Ventas, inventario y cocina conectados en tiempo real, con el costo real de cada plato.
        </p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          ${chip('cash', 'Ventas')}
          ${chip('box', 'Inventario')}
          ${chip('display', 'Cocina KDS')}
          ${chip('calculator', 'Costeo')}
        </div>
      </div>

      <!-- logo grande como protagonista visual -->
      <div style="flex-shrink:0;width:340px;height:340px;display:flex;align-items:center;justify-content:center;position:relative;">
        <div style="position:absolute;width:340px;height:340px;border-radius:50%;background:radial-gradient(circle,rgba(91,143,214,.35),transparent 70%);"></div>
        <div style="position:absolute;width:300px;height:300px;border-radius:50%;border:1px solid rgba(255,255,255,.08);"></div>
        <img src="${logoSrc}" width="270" height="270" style="position:relative;filter:drop-shadow(0 30px 60px rgba(0,0,0,.6));">
      </div>
    </div>

    <!-- pie -->
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <span style="font-size:15px;font-weight:700;color:#5b6578;letter-spacing:.3px;">gastroflow.digital</span>
      <span style="font-size:14px;font-weight:600;color:${LOGO_BLUE_LIGHT};">Gestión inteligente para restaurantes</span>
    </div>

  </div>
</body>
</html>`;
}

(async () => {
    const outPath = path.join(__dirname, '..', 'public', 'og-image.jpg');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
        await page.setContent(buildHtml(), { waitUntil: 'networkidle0' });
        await page.screenshot({ path: outPath, type: 'jpeg', quality: 88 });
        console.log('OG image generada en:', outPath);
    } finally {
        await browser.close();
    }
})().catch(err => {
    console.error('Error generando og-image:', err);
    process.exit(1);
});
