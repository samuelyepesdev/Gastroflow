/**
 * PdfCharts - Gráficas como SVG para los reportes PDF (pdfmake acepta
 * `{ svg, width }` en el docDefinition, así que no hace falta Chromium ni
 * canvas). Imitan las del dashboard: línea de ventas diarias, dona de métodos
 * de pago y barras por categoría.
 */

const { formatMoney } = require('../../utils/money');

const FONT = 'Roboto';
const COLOR_TEXTO = '#5b6b7e';
const COLOR_GRILLA = '#e4dccf';

function escapeXml(text) {
    return String(text ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

/** Monto compacto para ejes: 1.2M, 350k, 900. */
function montoCorto(n) {
    const v = Math.abs(n);
    if (v >= 1e6) {
        return `${(n / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace('.', ',')}M`;
    }
    if (v >= 1e3) {
        return `${Math.round(n / 1e3)}k`;
    }
    return String(Math.round(n));
}

/** Máximo "redondo" para el eje Y y sus marcas (0..max en 4 tramos). */
function escalaY(maxValor) {
    if (maxValor <= 0) {
        return { max: 1, ticks: [0] };
    }
    const magnitud = 10 ** Math.floor(Math.log10(maxValor));
    const paso = [1, 2, 2.5, 5, 10].map(m => m * magnitud).find(p => p * 4 >= maxValor);
    return { max: paso * 4, ticks: [0, 1, 2, 3, 4].map(i => i * paso) };
}

/** Ventas por día del mes: línea con área, como el gráfico del dashboard. */
function ventasDiariasSvg(dias, { width = 515, height = 190, color = '#28a745' } = {}) {
    const m = { top: 10, right: 10, bottom: 24, left: 42 };
    const w = width - m.left - m.right;
    const h = height - m.top - m.bottom;
    const { max, ticks } = escalaY(Math.max(0, ...dias.map(d => d.total_ventas)));
    const n = dias.length;
    const x = i => m.left + (n > 1 ? (i / (n - 1)) * w : w / 2);
    const y = v => m.top + h - (v / max) * h;

    const grilla = ticks
        .map(
            t =>
                `<line x1="${m.left}" y1="${y(t)}" x2="${m.left + w}" y2="${y(t)}" stroke="${COLOR_GRILLA}" stroke-width="0.5"/>` +
                `<text x="${m.left - 5}" y="${y(t) + 3}" font-family="${FONT}" font-size="7" fill="${COLOR_TEXTO}" text-anchor="end">${montoCorto(t)}</text>`
        )
        .join('');

    // Una etiqueta de día cada ~5 para que no se amontonen (siempre el primero y el último).
    const cadaN = n > 20 ? 5 : n > 10 ? 2 : 1;
    const etiquetas = dias
        .map((d, i) =>
            i % cadaN === 0 || i === n - 1
                ? `<text x="${x(i)}" y="${m.top + h + 14}" font-family="${FONT}" font-size="7" fill="${COLOR_TEXTO}" text-anchor="middle">${Number(d.fecha.slice(8, 10))}</text>`
                : ''
        )
        .join('');

    const puntos = dias.map((d, i) => `${x(i).toFixed(1)},${y(d.total_ventas).toFixed(1)}`);
    const area = `M${x(0).toFixed(1)},${y(0)} L${puntos.join(' L')} L${x(n - 1).toFixed(1)},${y(0)} Z`;

    return (
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
        grilla +
        `<path d="${area}" fill="${color}" fill-opacity="0.15"/>` +
        `<polyline points="${puntos.join(' ')}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>` +
        etiquetas +
        '</svg>'
    );
}

/** Dona de métodos de pago. `segmentos`: [{ value, color }]. */
function donaSvg(segmentos, { size = 130, grosor = 22 } = {}) {
    const total = segmentos.reduce((s, seg) => s + seg.value, 0);
    const c = size / 2;
    const r = c - grosor / 2;
    const circ = 2 * Math.PI * r;

    let acumulado = 0;
    const arcos = total
        ? segmentos
              .filter(seg => seg.value > 0)
              .map(seg => {
                  const largo = (seg.value / total) * circ;
                  const arco =
                      `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="${grosor}"` +
                      ` stroke-dasharray="${largo.toFixed(2)} ${(circ - largo).toFixed(2)}"` +
                      ` stroke-dashoffset="${(-acumulado).toFixed(2)}" transform="rotate(-90 ${c} ${c})"/>`;
                  acumulado += largo;
                  return arco;
              })
              .join('')
        : `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${COLOR_GRILLA}" stroke-width="${grosor}"/>`;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${arcos}</svg>`;
}

/** Barras horizontales por categoría. `items`: [{ etiqueta, valor }]. */
function barrasSvg(items, { width = 515, color = '#28a745', filaAlto = 20 } = {}) {
    const etiquetaAncho = 130;
    const valorAncho = 70;
    const barraMax = width - etiquetaAncho - valorAncho;
    const max = Math.max(1, ...items.map(i => i.valor));
    const height = items.length * filaAlto;

    const filas = items
        .map((it, i) => {
            const yy = i * filaAlto;
            const largo = Math.max(1, (it.valor / max) * barraMax);
            const etiqueta = it.etiqueta.length > 24 ? `${it.etiqueta.slice(0, 23)}…` : it.etiqueta;
            return (
                `<text x="0" y="${yy + 13}" font-family="${FONT}" font-size="8" fill="#223650">${escapeXml(etiqueta)}</text>` +
                `<rect x="${etiquetaAncho}" y="${yy + 4}" width="${largo.toFixed(1)}" height="11" rx="2" fill="${color}"/>` +
                `<text x="${etiquetaAncho + largo + 5}" y="${yy + 13}" font-family="${FONT}" font-size="8" fill="${COLOR_TEXTO}">${escapeXml(formatMoney(it.valor))}</text>`
            );
        })
        .join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${filas}</svg>`;
}

module.exports = { ventasDiariasSvg, donaSvg, barrasSvg, montoCorto };
