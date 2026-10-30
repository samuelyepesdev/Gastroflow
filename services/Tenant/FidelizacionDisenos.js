/**
 * FidelizacionDisenos - Diseños de la tarjeta de sellos de cada restaurante.
 *
 * Son diseños propios de fidelización (no los de los bonos): cada uno trae su paleta, su forma
 * de sello (taza, hoja, rombo...) y su fondo. El local elige uno y, si quiere, cambia el color
 * de acento, pone su logo y escribe un lema. De una sola función (`componer`) salen:
 *  - la imagen del pase en Google Wallet (1032x336, con los sellos ganados),
 *  - la vista previa de la pantalla de Fidelización (el mismo SVG),
 *  - la tarjeta imprimible con el QR de inscripción (1080x680).
 *
 * El texto se dibuja como trazos (TextoVectorial) para no depender de las fuentes del servidor.
 */
const sharp = require('sharp');
const { textoVectorial } = require('../Shared/TextoVectorial');

const HERO_ANCHO = 1032;
const HERO_ALTO = 336;
const IMPRESO_ANCHO = 1080;
const IMPRESO_ALTO = 680;
const COLOR_RE = /^#[0-9a-f]{6}$/i;
const DISENO_DEFECTO = 'cafe';

const colorValido = color => COLOR_RE.test(String(color || ''));

// ---- Color ----------------------------------------------------------------------------

function rgb(hex) {
    const n = Number.parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mezclar(hex, destino, t) {
    const [r, g, b] = rgb(hex);
    const mix = c => Math.round(c + (destino - c) * t);
    return `#${[mix(r), mix(g), mix(b)].map(c => c.toString(16).padStart(2, '0')).join('')}`;
}

const aclarar = (hex, t) => mezclar(hex, 255, t);
const oscurecer = (hex, t) => mezclar(hex, 0, t);

/** Luminancia percibida 0..1 (para elegir texto claro u oscuro encima de un color). */
function luminancia(hex) {
    const [r, g, b] = rgb(hex);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

const contraste = hex => (luminancia(hex) > 0.62 ? '#16283e' : '#ffffff');

// ---- Figuras de sello ----------------------------------------------------------------

const attrs = ({ relleno = 'none', trazo = 'none', ancho = 0, dash, opTrazo = 1 }) =>
    `fill="${relleno}" stroke="${trazo}" stroke-width="${ancho}" stroke-opacity="${opTrazo}" stroke-linejoin="round" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ''}`;

const poligono = (puntos, estilo) =>
    `<polygon points="${puntos.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}" ${attrs(estilo)}/>`;

/** Figura centrada en (cx, cy) que cabe en un círculo de radio r. */
function figura(tipo, cx, cy, r, estilo) {
    const p = (x, y) => `${(cx + x * r).toFixed(1)} ${(cy + y * r).toFixed(1)}`;
    switch (tipo) {
        case 'cuadrado': {
            const s = r * 0.9;
            return `<rect x="${(cx - s).toFixed(1)}" y="${(cy - s).toFixed(1)}" width="${(s * 2).toFixed(1)}" height="${(s * 2).toFixed(1)}" rx="${(s * 0.28).toFixed(1)}" ${attrs(estilo)}/>`;
        }
        case 'hexagono':
            return poligono(
                Array.from({ length: 6 }, (_, i) => [
                    cx + r * 1.03 * Math.cos((Math.PI / 3) * i - Math.PI / 2),
                    cy + r * 1.03 * Math.sin((Math.PI / 3) * i - Math.PI / 2)
                ]),
                estilo
            );
        case 'rombo':
            return poligono(
                [
                    [cx, cy - r * 1.1],
                    [cx + r * 0.95, cy],
                    [cx, cy + r * 1.1],
                    [cx - r * 0.95, cy]
                ],
                estilo
            );
        case 'estrella':
            return poligono(
                Array.from({ length: 10 }, (_, i) => {
                    const radio = i % 2 === 0 ? r * 1.12 : r * 0.52;
                    const a = (Math.PI / 5) * i - Math.PI / 2;
                    return [cx + radio * Math.cos(a), cy + radio * Math.sin(a)];
                }),
                estilo
            );
        case 'hoja':
            return `<path d="M${p(0, -1.08)} C${p(1.0, -0.6)} ${p(0.85, 0.6)} ${p(0, 1.08)} C${p(-0.85, 0.6)} ${p(-1.0, -0.6)} ${p(0, -1.08)} Z" ${attrs(estilo)}/>`;
        case 'taza': {
            // Taza con plato: el cuerpo lleva el relleno y el asa y el plato solo trazo.
            const linea = estilo.trazo && estilo.trazo !== 'none' ? estilo.trazo : estilo.relleno;
            const ancho = Math.max(estilo.ancho || 0, r * 0.12);
            const lineaAttrs = `fill="none" stroke="${linea}" stroke-width="${ancho.toFixed(1)}" stroke-opacity="${estilo.opTrazo ?? 1}" stroke-linecap="round" stroke-linejoin="round"`;
            return (
                `<path d="M${p(-0.72, -0.3)} L${p(0.5, -0.3)} L${p(0.5, 0.2)} C${p(0.5, 0.62)} ${p(0.2, 0.72)} ${p(-0.1, 0.72)} C${p(-0.45, 0.72)} ${p(-0.72, 0.58)} ${p(-0.72, 0.2)} Z" ${attrs(estilo)}/>` +
                `<path d="M${p(0.5, -0.12)} C${p(0.98, -0.12)} ${p(0.98, 0.4)} ${p(0.46, 0.4)}" ${lineaAttrs}/>` +
                `<path d="M${p(-0.95, 0.9)} L${p(0.85, 0.9)}" ${lineaAttrs}/>` +
                `<path d="M${p(-0.4, -0.52)} Q${p(-0.25, -0.7)} ${p(-0.4, -0.88)} M${p(0.05, -0.52)} Q${p(0.2, -0.7)} ${p(0.05, -0.88)}" ${lineaAttrs}/>`
            );
        }
        default:
            return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" ${attrs(estilo)}/>`;
    }
}

function check(cx, cy, r, color, k = 1) {
    const s = r * 0.42 * k;
    return `<polyline points="${(cx - s).toFixed(1)},${cy.toFixed(1)} ${(cx - s * 0.25).toFixed(1)},${(cy + s * 0.7).toFixed(1)} ${(cx + s).toFixed(1)},${(cy - s * 0.65).toFixed(1)}" fill="none" stroke="${color}" stroke-width="${(r * 0.2 * k).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** Regalo (el último sello es el premio). Solo trazo, para que se vea sobre cualquier relleno. */
function regalo(cx, cy, r, color, ancho, opacidad = 1) {
    const p = (x, y) => `${(cx + x * r).toFixed(1)} ${(cy + y * r).toFixed(1)}`;
    return (
        `<g fill="none" stroke="${color}" stroke-opacity="${opacidad}" stroke-width="${ancho.toFixed(1)}" stroke-linecap="round" stroke-linejoin="round">` +
        `<path d="M${p(-0.62, -0.1)} L${p(-0.62, 0.8)} L${p(0.62, 0.8)} L${p(0.62, -0.1)}"/>` +
        `<path d="M${p(-0.8, -0.1)} L${p(0.8, -0.1)} L${p(0.8, -0.42)} L${p(-0.8, -0.42)} Z"/>` +
        `<path d="M${p(0, -0.42)} L${p(0, 0.8)}"/>` +
        `<path d="M${p(0, -0.42)} C${p(-0.15, -0.95)} ${p(-0.7, -0.95)} ${p(-0.45, -0.45)} M${p(0, -0.42)} C${p(0.15, -0.95)} ${p(0.7, -0.95)} ${p(0.45, -0.45)}"/>` +
        '</g>'
    );
}

// ---- Fondos ---------------------------------------------------------------------------

function hojaDecor(x, y, largo, rot, color, opacidad) {
    return `<path transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot})" fill="${color}" fill-opacity="${opacidad}" d="M0 0 Q${largo * 0.5} ${-largo * 0.32} ${largo} 0 Q${largo * 0.5} ${largo * 0.32} 0 0 Z"/>`;
}

const FONDOS = {
    cafe: (w, h) => {
        const u = w / HERO_ANCHO;
        return `<defs><filter id="ruido" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 0.25  0 0 0 0 0.14  0 0 0 0 0.07  0 0 0 0.45 0"/></filter></defs>
<rect width="${w}" height="${h}" fill="#dcc19b"/>
<rect width="${w}" height="${h}" filter="url(#ruido)" opacity="0.55"/>
<circle cx="${w * 0.92}" cy="${h * 0.1}" r="${66 * u}" fill="none" stroke="#5a3a22" stroke-opacity="0.10" stroke-width="${9 * u}"/>
<rect x="${14 * u}" y="${14 * u}" width="${w - 28 * u}" height="${h - 28 * u}" rx="${18 * u}" fill="none" stroke="#5a3a22" stroke-opacity="0.45" stroke-width="${2.5 * u}" stroke-dasharray="${10 * u} ${8 * u}"/>`;
    },
    neon: (w, h, ac) => {
        const u = w / HERO_ANCHO;
        return `<defs>
<linearGradient id="fn" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b0b2e"/><stop offset="1" stop-color="#07070f"/></linearGradient>
<radialGradient id="rn" cx="0.12" cy="0.05" r="0.7"><stop offset="0" stop-color="${ac}" stop-opacity="0.38"/><stop offset="1" stop-color="${ac}" stop-opacity="0"/></radialGradient>
<filter id="brillo" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${4.5 * u}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<rect width="${w}" height="${h}" fill="url(#fn)"/>
<rect width="${w}" height="${h}" fill="url(#rn)"/>
<rect x="${12 * u}" y="${12 * u}" width="${w - 24 * u}" height="${h - 24 * u}" rx="${22 * u}" fill="none" stroke="${ac}" stroke-width="${3 * u}" filter="url(#brillo)"/>`;
    },
    ticket: (w, h) => {
        const u = w / HERO_ANCHO;
        const fuera = '#e4dac4';
        const paso = 26 * u;
        let sierra = '';
        for (let x = 0; x < w; x += paso) {
            sierra += `<polygon points="${x.toFixed(1)},0 ${(x + paso / 2).toFixed(1)},${(9 * u).toFixed(1)} ${(x + paso).toFixed(1)},0" fill="${fuera}"/>`;
            sierra += `<polygon points="${x.toFixed(1)},${h} ${(x + paso / 2).toFixed(1)},${(h - 9 * u).toFixed(1)} ${(x + paso).toFixed(1)},${h}" fill="${fuera}"/>`;
        }
        return `<rect width="${w}" height="${h}" fill="#fff4dc"/>${sierra}
<circle cx="0" cy="${h / 2}" r="${24 * u}" fill="${fuera}"/><circle cx="${w}" cy="${h / 2}" r="${24 * u}" fill="${fuera}"/>
<rect x="${22 * u}" y="${22 * u}" width="${w - 44 * u}" height="${h - 44 * u}" rx="${10 * u}" fill="none" stroke="#7a6a55" stroke-opacity="0.45" stroke-width="${2 * u}" stroke-dasharray="${6 * u} ${6 * u}"/>`;
    },
    minimal: (w, h, ac) => {
        const u = w / HERO_ANCHO;
        return `<rect width="${w}" height="${h}" fill="#ffffff"/>
<rect x="${1 * u}" y="${1 * u}" width="${w - 2 * u}" height="${h - 2 * u}" fill="none" stroke="#e4dccf" stroke-width="${2 * u}"/>
<rect x="${32 * u}" y="0" width="${90 * u}" height="${7 * u}" fill="${ac}"/>`;
    },
    pizarra: (w, h) => {
        const u = w / HERO_ANCHO;
        return `<defs><radialGradient id="rp" cx="0.5" cy="0.4" r="0.8"><stop offset="0" stop-color="#2f4239"/><stop offset="1" stop-color="#1b2722"/></radialGradient></defs>
<rect width="${w}" height="${h}" fill="url(#rp)"/>
<ellipse cx="${w * 0.3}" cy="${h * 0.3}" rx="${220 * u}" ry="${60 * u}" fill="#ffffff" fill-opacity="0.035" transform="rotate(-8 ${w * 0.3} ${h * 0.3})"/>
<ellipse cx="${w * 0.75}" cy="${h * 0.75}" rx="${180 * u}" ry="${50 * u}" fill="#ffffff" fill-opacity="0.03" transform="rotate(6 ${w * 0.75} ${h * 0.75})"/>
<rect x="${7 * u}" y="${7 * u}" width="${w - 14 * u}" height="${h - 14 * u}" rx="${6 * u}" fill="none" stroke="#9a6a38" stroke-width="${14 * u}"/>
<rect x="${14.5 * u}" y="${14.5 * u}" width="${w - 29 * u}" height="${h - 29 * u}" rx="${2 * u}" fill="none" stroke="#000000" stroke-opacity="0.25" stroke-width="${2 * u}"/>`;
    },
    pop: (w, h, ac) => {
        const u = w / HERO_ANCHO;
        return `<rect width="${w}" height="${h}" fill="${ac}"/>
<circle cx="${w * 0.6}" cy="${-14 * u}" r="${70 * u}" fill="#ffd23f" fill-opacity="0.9"/>
<circle cx="${w * 0.03}" cy="${h * 0.98}" r="${110 * u}" fill="#26c6b0" fill-opacity="0.85"/>
<circle cx="${w * 0.52}" cy="${h * 0.12}" r="${14 * u}" fill="#ffffff" fill-opacity="0.4"/>
<circle cx="${w * 0.42}" cy="${h * 0.97}" r="${18 * u}" fill="#ffffff" fill-opacity="0.35"/>
<circle cx="${w * 0.96}" cy="${h * 0.97}" r="${60 * u}" fill="#ffd23f" fill-opacity="0.7"/>`;
    },
    elegante: (w, h, ac) => {
        const u = w / HERO_ANCHO;
        const rombo = (x, y) =>
            `<polygon points="${x},${y - 7 * u} ${x + 7 * u},${y} ${x},${y + 7 * u} ${x - 7 * u},${y}" fill="${ac}"/>`;
        return `<defs><linearGradient id="fe" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0e1b2c"/><stop offset="1" stop-color="#090909"/></linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#fe)"/>
<rect x="${13 * u}" y="${13 * u}" width="${w - 26 * u}" height="${h - 26 * u}" fill="none" stroke="${ac}" stroke-width="${2.5 * u}"/>
<rect x="${23 * u}" y="${23 * u}" width="${w - 46 * u}" height="${h - 46 * u}" fill="none" stroke="${ac}" stroke-opacity="0.5" stroke-width="${1.2 * u}"/>
${rombo(13 * u, 13 * u)}${rombo(w - 13 * u, 13 * u)}${rombo(13 * u, h - 13 * u)}${rombo(w - 13 * u, h - 13 * u)}`;
    },
    fresco: (w, h) => {
        const u = w / HERO_ANCHO;
        return `<defs><linearGradient id="ff" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4fbf6"/><stop offset="1" stop-color="#d9f0e1"/></linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#ff)"/>
${hojaDecor(-10 * u, 36 * u, 130 * u, -25, '#34a86a', 0.45)}${hojaDecor(8 * u, 80 * u, 100 * u, 12, '#5bc489', 0.4)}${hojaDecor(24 * u, 6 * u, 80 * u, -62, '#2f9e5b', 0.4)}
${hojaDecor(w + 10 * u, h - 30 * u, 150 * u, 205, '#34a86a', 0.4)}${hojaDecor(w - 4 * u, h - 74 * u, 100 * u, 168, '#5bc489', 0.4)}${hojaDecor(w - 40 * u, h + 4 * u, 80 * u, 242, '#2f9e5b', 0.4)}
<circle cx="${w * 0.5}" cy="${6 * u}" r="${5 * u}" fill="#2f9e5b" fill-opacity="0.3"/>`;
    },
    retro: (w, h) => {
        const u = w / HERO_ANCHO;
        const franja = (y, grosor, color) => `<rect x="0" y="${y}" width="${w}" height="${grosor}" fill="${color}"/>`;
        const g = 8 * u;
        return `<rect width="${w}" height="${h}" fill="#fdf3dc"/>
${franja(0, g, '#d62828')}${franja(g, g, '#2a9d8f')}${franja(g * 2, g, '#f4a261')}
${franja(h - g, g, '#d62828')}${franja(h - g * 2, g, '#2a9d8f')}${franja(h - g * 3, g, '#f4a261')}`;
    }
};

// ---- Catálogo ---------------------------------------------------------------------------

const DISENOS = [
    {
        id: 'cafe',
        nombre: 'Café',
        acento: '#7c3f1d',
        forma: 'taza',
        paleta: () => ({ tinta: '#3b2417', suave: '#6b4a33' }),
        panel: { fill: '#fff7e8', opacity: 0.55 },
        vacio: { fill: 'none', opacidad: 0.75 }
    },
    {
        id: 'neon',
        nombre: 'Neón',
        acento: '#ff2e93',
        forma: 'circulo',
        filtro: 'brillo',
        paleta: () => ({ tinta: '#ffffff', suave: '#b9a7d6' }),
        panel: { fill: '#ffffff', opacity: 0.05 },
        vacio: { fill: 'none', opacidad: 0.8 }
    },
    {
        id: 'ticket',
        nombre: 'Ticket',
        acento: '#d9480f',
        forma: 'cuadrado',
        paleta: () => ({ tinta: '#2b2118', suave: '#7a6a55' }),
        panel: null,
        vacio: { fill: '#ffffff', opacidad: 0.7 }
    },
    {
        id: 'minimal',
        nombre: 'Minimal',
        acento: '#0e1b2c',
        forma: 'circulo',
        paleta: () => ({ tinta: '#0e1b2c', suave: '#5b6b7e' }),
        panel: { fill: '#f9fafb', opacity: 1, stroke: '#e4dccf' },
        vacio: { fill: '#ffffff', opacidad: 0.45 }
    },
    {
        id: 'pizarra',
        nombre: 'Pizarra',
        acento: '#f4d35e',
        forma: 'circulo',
        paleta: () => ({ tinta: '#f5f5f0', suave: '#c3cbc5' }),
        panel: { fill: '#ffffff', opacity: 0.05 },
        vacio: { fill: 'none', opacidad: 0.7 }
    },
    {
        id: 'pop',
        nombre: 'Pop',
        acento: '#ff4d6d',
        forma: 'estrella',
        paleta: ac => ({ tinta: contraste(ac), suave: contraste(ac) === '#ffffff' ? '#ffe3ea' : '#4b5563' }),
        panel: { fill: '#ffffff', opacity: 0.95 },
        vacio: { fill: '#ffffff', opacidad: 0.6 }
    },
    {
        id: 'elegante',
        nombre: 'Elegante',
        acento: '#c9a227',
        forma: 'rombo',
        paleta: () => ({ tinta: '#f3ead2', suave: '#b8a77a' }),
        panel: { fill: '#ffffff', opacity: 0.04, stroke: 'acento' },
        vacio: { fill: 'none', opacidad: 0.7 }
    },
    {
        id: 'fresco',
        nombre: 'Fresco',
        acento: '#2f9e5b',
        forma: 'hoja',
        paleta: () => ({ tinta: '#14452f', suave: '#4f7a62' }),
        panel: { fill: '#ffffff', opacity: 0.7 },
        vacio: { fill: '#ffffff', opacidad: 0.5 }
    },
    {
        id: 'retro',
        nombre: 'Retro',
        acento: '#d62828',
        forma: 'hexagono',
        paleta: () => ({ tinta: '#3a2a1e', suave: '#7a6350' }),
        panel: { fill: '#ffffff', opacity: 0.6 },
        vacio: { fill: '#ffffff', opacidad: 0.55 }
    }
];

// Diseños de fondo oscuro (el resto es claro, salvo Pop que toma el color de acento como fondo).
const FONDO_OSCURO = new Set(['neon', 'pizarra', 'elegante']);

const obtener = id => DISENOS.find(d => d.id === id) || DISENOS.find(d => d.id === DISENO_DEFECTO);

/**
 * Color para los textos destacados (premio, nombre del programa): el acento, corregido si no se
 * leería sobre el fondo del diseño (un amarillo sobre crema, un azul marino sobre negro...).
 */
function colorDestacado(diseno, ac, tinta) {
    if (diseno.id === 'pop') {
        return tinta;
    }
    if (FONDO_OSCURO.has(diseno.id)) {
        return luminancia(ac) < 0.35 ? aclarar(ac, 0.5) : ac;
    }
    return luminancia(ac) > 0.62 ? oscurecer(ac, 0.45) : ac;
}

/** Id de diseño válido (cae en el de por defecto si no existe). */
const disenoValido = id => obtener(id).id;

/** Color con el que se pinta: el del local si lo eligió, o el de acento propio del diseño. */
const colorAcento = (diseno, color) => (colorValido(color) ? color : obtener(diseno).acento);

/** Color de fondo de la tarjeta en Google Wallet (el de la cabecera del pase) según el diseño. */
function fondoWallet(diseno, color) {
    const bases = {
        cafe: '#c9a679',
        neon: '#12081f',
        ticket: '#fff4dc',
        minimal: '#ffffff',
        pizarra: '#22302b',
        elegante: '#111111',
        fresco: '#d9f0e1',
        retro: '#fdf3dc'
    };
    const d = obtener(diseno);
    return d.id === 'pop' ? colorAcento(d.id, color) : bases[d.id];
}

// ---- Disposición de los sellos -------------------------------------------------------------

/** Reparte N sellos en la zona usando 1 a 3 filas, las que den el sello más grande. */
function distribuir({ x, y, w, h }, n, maxR) {
    let mejor = null;
    for (const filas of [1, 2, 3]) {
        const porFila = Math.ceil(n / filas);
        const r = Math.min(w / porFila, h / filas) * 0.4;
        if (!mejor || r > mejor.r * 1.05) {
            mejor = { filas, porFila, r };
        }
    }
    const r = Math.min(mejor.r, maxR);
    const celdaW = w / mejor.porFila;
    const celdaH = h / mejor.filas;
    const posiciones = [];
    for (let i = 0; i < n; i++) {
        const fila = Math.floor(i / mejor.porFila);
        const enFila = fila === mejor.filas - 1 ? n - mejor.porFila * (mejor.filas - 1) : mejor.porFila;
        const col = i - fila * mejor.porFila;
        posiciones.push({
            cx: x + (w - enFila * celdaW) / 2 + celdaW * (col + 0.5),
            cy: y + celdaH * (fila + 0.5),
            r
        });
    }
    return posiciones;
}

function dibujarSellos(diseno, ac, marca, zona, n, ganados, maxR) {
    let svg = '';
    distribuir(zona, n, maxR).forEach(({ cx, cy, r }, i) => {
        const esPremio = i === n - 1;
        if (i < ganados) {
            svg += figura(diseno.forma, cx, cy, r, { relleno: ac });
            svg += esPremio
                ? regalo(cx, cy, r * 0.62, marca, r * 0.11)
                : check(cx, diseno.forma === 'taza' ? cy + r * 0.12 : cy, r, marca, diseno.forma === 'taza' ? 0.62 : 1);
        } else {
            svg += figura(diseno.forma, cx, cy, r, {
                relleno: diseno.vacio.fill,
                trazo: ac,
                ancho: Math.max(2.5, r * 0.07),
                dash: `${(r * 0.24).toFixed(1)} ${(r * 0.2).toFixed(1)}`,
                opTrazo: diseno.vacio.opacidad
            });
            if (esPremio) {
                svg += regalo(cx, cy, r * 0.62, ac, r * 0.1, 0.9);
            }
        }
    });
    return diseno.filtro ? `<g filter="url(#${diseno.filtro})">${svg}</g>` : svg;
}

function panelDe(diseno, ac, { x, y, w, h, rx }) {
    if (!diseno.panel) {
        return '';
    }
    const borde = diseno.panel.stroke === 'acento' ? ac : diseno.panel.stroke;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${diseno.panel.fill}" fill-opacity="${diseno.panel.opacity}"${borde ? ` stroke="${borde}" stroke-opacity="0.5" stroke-width="2"` : ''}/>`;
}

/** Medallón con el logo (círculo claro con aro de acento). Sin logo no dibuja nada. */
function medallon(logo, cx, cy, r, ac, id) {
    if (!logo) {
        return '';
    }
    const lado = r * 1.56;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff"/>
<circle cx="${cx}" cy="${cy}" r="${r - 2}" fill="none" stroke="${ac}" stroke-width="4"/>
<clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${r - 6}"/></clipPath>
<image x="${(cx - lado / 2).toFixed(1)}" y="${(cy - lado / 2).toFixed(1)}" width="${lado.toFixed(1)}" height="${lado.toFixed(1)}" preserveAspectRatio="xMidYMid meet" clip-path="url(#${id})" xlink:href="${logo}"/>`;
}

// ---- Composición ------------------------------------------------------------------------------

/**
 * SVG de la tarjeta.
 * @param {object} o
 * @param {string} o.diseno
 * @param {string} [o.color] acento propio (#RRGGBB)
 * @param {number} [o.sellos] sellos ganados
 * @param {number} [o.total] sellos para el premio
 * @param {'wallet'|'impreso'} [o.modo] wallet = imagen del pase, impreso = tarjeta con QR
 * @param {string} [o.restaurante] nombre del local
 * @param {string} [o.lema] frase corta bajo el nombre
 * @param {string} [o.premio]
 * @param {string} [o.programa] nombre del programa (solo impreso)
 * @param {string} [o.regla] texto de la regla (solo impreso)
 * @param {string|null} [o.logo] logo como data URI PNG
 * @param {string|null} [o.qr] QR como data URI PNG (solo impreso)
 */
function componer(o) {
    const diseno = obtener(o.diseno);
    const ac = colorAcento(diseno.id, o.color);
    const pal = diseno.paleta(ac);
    const marca = contraste(ac);
    const destacado = colorDestacado(diseno, ac, pal.tinta);
    const impreso = o.modo === 'impreso';
    const W = impreso ? IMPRESO_ANCHO : HERO_ANCHO;
    const H = impreso ? IMPRESO_ALTO : HERO_ALTO;
    const n = Math.max(2, Math.min(Number(o.total) || 8, 20));
    const ganados = Math.max(0, Math.min(Number(o.sellos) || 0, n));
    const texto = (t, opciones) => textoVectorial(t, opciones).svg;
    const fondo = FONDOS[diseno.id](W, H, ac);
    let capas = '';

    if (impreso) {
        const xTexto = o.logo ? 48 + 110 + 26 : 48;
        const anchoTexto = 700 - xTexto;
        capas += medallon(o.logo, 48 + 55, 44 + 55, 55, ac, 'logo');
        capas += texto(o.restaurante, {
            x: xTexto,
            y: o.lema ? 88 : 104,
            tamano: 46,
            peso: 'bold',
            color: pal.tinta,
            maxAncho: anchoTexto
        });
        capas += texto(o.lema, { x: xTexto, y: 130, tamano: 26, color: pal.suave, maxAncho: anchoTexto });
        capas += texto(o.programa, { x: 48, y: 212, tamano: 42, peso: 'bold', color: destacado, maxAncho: 650 });
        capas += texto(`Junta ${n} sellos y gana:`, { x: 48, y: 256, tamano: 26, color: pal.tinta, maxAncho: 650 });
        capas += texto(o.premio, { x: 48, y: 298, tamano: 34, peso: 'bold', color: pal.tinta, maxAncho: 650 });
        const zona = { x: 48, y: 322, w: 652, h: 270 };
        capas += panelDe(diseno, ac, { x: zona.x - 12, y: zona.y - 6, w: zona.w + 24, h: zona.h + 12, rx: 28 });
        capas += dibujarSellos(diseno, ac, marca, zona, n, 0, 44);
        capas += texto(o.regla, { x: 48, y: 636, tamano: 22, color: pal.suave, maxAncho: 660 });
        // Panel del QR
        capas += `<rect x="742" y="50" width="290" height="580" rx="30" fill="#000000" fill-opacity="0.12" transform="translate(3 5)"/>
<rect x="742" y="50" width="290" height="580" rx="30" fill="#ffffff"/>`;
        capas += texto('ÚNETE GRATIS', {
            x: 887,
            y: 112,
            tamano: 28,
            peso: 'bold',
            color: colorDestacado({ id: 'claro' }, ac),
            ancla: 'middle',
            maxAncho: 250
        });
        if (o.qr) {
            capas += `<image x="767" y="140" width="240" height="240" xlink:href="${o.qr}"/>`;
        }
        ['Escanea con la cámara', 'de tu celular y guarda tu', 'tarjeta en Google Wallet.'].forEach((linea, i) => {
            capas += texto(linea, {
                x: 887,
                y: 430 + i * 34,
                tamano: 22,
                color: '#5b6b7e',
                ancla: 'middle',
                maxAncho: 250
            });
        });
    } else {
        const xTexto = o.logo ? 32 + 84 + 22 : 32;
        const maxNombre = 640 - xTexto - 20;
        capas += medallon(o.logo, 32 + 42, 24 + 44, 42, ac, 'logo');
        capas += texto(o.restaurante, {
            x: xTexto,
            y: o.lema ? 64 : 80,
            tamano: 38,
            peso: 'bold',
            color: pal.tinta,
            maxAncho: maxNombre
        });
        capas += texto(o.lema, { x: xTexto, y: 96, tamano: 22, color: pal.suave, maxAncho: maxNombre });
        if (o.premio) {
            capas += texto('PREMIO', { x: W - 32, y: 46, tamano: 15, peso: 'bold', color: pal.suave, ancla: 'end' });
            capas += texto(o.premio, {
                x: W - 32,
                y: 84,
                tamano: 30,
                peso: 'bold',
                color: destacado,
                ancla: 'end',
                maxAncho: 380
            });
        }
        const zona = { x: 40, y: 128, w: W - 80, h: 184 };
        capas += panelDe(diseno, ac, { x: 24, y: 122, w: W - 48, h: 196, rx: 28 });
        capas += dibujarSellos(diseno, ac, marca, zona, n, ganados, 46);
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${fondo}${capas}</svg>`;
}

// ---- Imágenes y logos -----------------------------------------------------------------------

/** PNG de la tarjeta. `escala` 1 = tamaño del pase, 2 = para imprimir. */
function aPng(opciones, escala = 1) {
    const impreso = opciones.modo === 'impreso';
    const ancho = (impreso ? IMPRESO_ANCHO : HERO_ANCHO) * escala;
    const alto = (impreso ? IMPRESO_ALTO : HERO_ALTO) * escala;
    return sharp(Buffer.from(componer(opciones)), { density: 72 * escala })
        .resize(ancho, alto)
        .png({ compressionLevel: 9 })
        .toBuffer();
}

const cacheLogos = new Map();
const MAX_LOGOS_EN_CACHE = 50;
const MAX_BYTES_LOGO = 8 * 1024 * 1024;

/**
 * Logo del local como data URI PNG (256 px máx.) para incrustarlo en la tarjeta.
 * Acepta una URL https (R2) o un data URI (logos viejos guardados en la base). Si falla, null:
 * la tarjeta sale igual, sin logo.
 */
async function cargarLogo(fuente) {
    if (!fuente) {
        return null;
    }
    if (cacheLogos.has(fuente)) {
        return cacheLogos.get(fuente);
    }
    try {
        let buffer;
        if (fuente.startsWith('data:')) {
            buffer = Buffer.from(fuente.split(',')[1] || '', 'base64');
        } else if (/^https:\/\//.test(fuente)) {
            const res = await fetch(fuente, { signal: AbortSignal.timeout(8000) });
            if (!res.ok) {
                return null;
            }
            buffer = Buffer.from(await res.arrayBuffer());
        } else {
            return null;
        }
        if (buffer.length > MAX_BYTES_LOGO) {
            return null;
        }
        const png = await sharp(buffer).resize(256, 256, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
        const uri = `data:image/png;base64,${png.toString('base64')}`;
        if (!fuente.startsWith('data:')) {
            if (cacheLogos.size >= MAX_LOGOS_EN_CACHE) {
                cacheLogos.delete(cacheLogos.keys().next().value);
            }
            cacheLogos.set(fuente, uri);
        }
        return uri;
    } catch (error) {
        console.error('Fidelización: no se pudo preparar el logo de la tarjeta:', error.message);
        return null;
    }
}

/** Catálogo para el selector: cada diseño con su miniatura (mismo SVG con 3 sellos de muestra). */
function listarParaUI(datos) {
    return DISENOS.map(d => ({
        id: d.id,
        nombre: d.nombre,
        acento: d.acento,
        svg: componer({ ...datos, diseno: d.id, color: datos.color, sellos: 3 })
    }));
}

module.exports = {
    HERO_ANCHO,
    HERO_ALTO,
    IMPRESO_ANCHO,
    IMPRESO_ALTO,
    DISENO_DEFECTO,
    colorValido,
    disenoValido,
    colorAcento,
    fondoWallet,
    aclarar,
    oscurecer,
    componer,
    aPng,
    cargarLogo,
    listarParaUI
};
