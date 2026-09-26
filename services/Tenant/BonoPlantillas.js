/**
 * BonoPlantillas - Catálogo de diseños para el comprobante de bonos
 * (BonoComprobanteService). Cada plantilla define su paleta, el título que se
 * imprime y un fondo ilustrado en SVG (pdfmake lo dibuja como vector, así que
 * pesa poco y no depende de imágenes externas).
 *
 * Convención de diseño, para que el texto siempre se lea:
 *  - La franja izquierda (x < ~330) lleva el texto: la decoración ahí es tenue.
 *  - A la derecha va un panel blanco con valor, QR y código (lo dibuja el
 *    comprobante, no la plantilla), así que la decoración fuerte va en bordes.
 *
 * Para agregar una plantilla: una entrada más en PLANTILLAS con su fondo().
 */

const ANCHO = 540;
const ALTO = 340;

// ---- Formas reutilizables (todas devuelven fragmentos SVG) ----

function corazon(x, y, s, color, opacidad = 1, rot = 0) {
    return `<path transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" fill="${color}" fill-opacity="${opacidad}"
        d="M0 0.35 C-0.1 0.25 -0.55 -0.02 -0.55 -0.3 C-0.55 -0.55 -0.22 -0.66 0 -0.4 C0.22 -0.66 0.55 -0.55 0.55 -0.3 C0.55 -0.02 0.1 0.25 0 0.35 Z"/>`;
}

function estrella(x, y, rExt, color, opacidad = 1, puntas = 5) {
    const rInt = rExt * 0.45;
    const pts = [];
    for (let i = 0; i < puntas * 2; i++) {
        const r = i % 2 === 0 ? rExt : rInt;
        const a = (Math.PI / puntas) * i - Math.PI / 2;
        pts.push(`${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}`);
    }
    return `<polygon points="${pts.join(' ')}" fill="${color}" fill-opacity="${opacidad}"/>`;
}

function destello(x, y, r, color, opacidad = 1) {
    // Estrella de 4 puntas finas (brillo)
    return `<path fill="${color}" fill-opacity="${opacidad}" d="M${x} ${y - r} Q${x + r * 0.15} ${y - r * 0.15} ${x + r} ${y} Q${x + r * 0.15} ${y + r * 0.15} ${x} ${y + r} Q${x - r * 0.15} ${y + r * 0.15} ${x - r} ${y} Q${x - r * 0.15} ${y - r * 0.15} ${x} ${y - r} Z"/>`;
}

function flor(x, y, r, petalo, centro, opacidad = 1) {
    let s = '';
    for (let i = 0; i < 5; i++) {
        const a = ((Math.PI * 2) / 5) * i;
        s += `<circle cx="${(x + Math.cos(a) * r).toFixed(1)}" cy="${(y + Math.sin(a) * r).toFixed(1)}" r="${r * 0.85}" fill="${petalo}" fill-opacity="${opacidad}"/>`;
    }
    return s + `<circle cx="${x}" cy="${y}" r="${r * 0.6}" fill="${centro}" fill-opacity="${opacidad}"/>`;
}

function hoja(x, y, largo, rot, color, opacidad = 1) {
    return `<path transform="translate(${x} ${y}) rotate(${rot})" fill="${color}" fill-opacity="${opacidad}"
        d="M0 0 Q${largo * 0.5} ${-largo * 0.35} ${largo} 0 Q${largo * 0.5} ${largo * 0.35} 0 0 Z"/>`;
}

function copoNieve(x, y, r, color, opacidad = 1) {
    let s = '';
    for (let i = 0; i < 3; i++) {
        const a = (Math.PI / 3) * i;
        const dx = (Math.cos(a) * r).toFixed(1);
        const dy = (Math.sin(a) * r).toFixed(1);
        s += `<line x1="${x - dx}" y1="${y - dy}" x2="${x + Number(dx)}" y2="${y + Number(dy)}" stroke="${color}" stroke-opacity="${opacidad}" stroke-width="${Math.max(1, r / 6)}" stroke-linecap="round"/>`;
    }
    return s + `<circle cx="${x}" cy="${y}" r="${r / 5}" fill="${color}" fill-opacity="${opacidad}"/>`;
}

function globo(x, y, r, color, opacidad = 1) {
    return `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 1.2}" fill="${color}" fill-opacity="${opacidad}"/>
        <polygon points="${x - 4},${y + r * 1.2 + 5} ${x + 4},${y + r * 1.2 + 5} ${x},${y + r * 1.2 - 1}" fill="${color}" fill-opacity="${opacidad}"/>
        <path d="M${x} ${y + r * 1.2 + 5} q-8 18 4 34 q10 14 -2 30" stroke="${color}" stroke-opacity="${opacidad * 0.7}" stroke-width="1.2" fill="none"/>
        <ellipse cx="${x - r * 0.35}" cy="${y - r * 0.45}" rx="${r * 0.18}" ry="${r * 0.3}" fill="#ffffff" fill-opacity="0.45"/>`;
}

function murcielago(x, y, s, color, opacidad = 1) {
    return `<path transform="translate(${x} ${y}) scale(${s})" fill="${color}" fill-opacity="${opacidad}"
        d="M0 -4 C-3 -9 -9 -10 -14 -8 C-11 -6 -10 -3 -11 0 C-15 -3 -21 -2 -25 1 C-19 1 -15 4 -13 8 C-9 4 -4 3 0 6 C4 3 9 4 13 8 C15 4 19 1 25 1 C21 -2 15 -3 11 0 C10 -3 11 -6 14 -8 C9 -10 3 -9 0 -4 Z"/>`;
}

function confeti(semilla, colores, cantidad, zona) {
    // Pseudoaleatorio determinístico: el mismo bono siempre se dibuja igual.
    let seed = semilla;
    const rnd = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
    };
    let s = '';
    for (let i = 0; i < cantidad; i++) {
        const x = zona.x + rnd() * zona.w;
        const y = zona.y + rnd() * zona.h;
        const c = colores[i % colores.length];
        if (i % 3 === 0) {
            s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(2 + rnd() * 2.5).toFixed(1)}" fill="${c}" fill-opacity="0.85"/>`;
        } else {
            s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(4 + rnd() * 5).toFixed(1)}" height="${(2.5 + rnd() * 2).toFixed(1)}" rx="1" fill="${c}" fill-opacity="0.85" transform="rotate(${(rnd() * 180).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
        }
    }
    return s;
}

function svg(defs, cuerpo) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${ANCHO}" height="${ALTO}" viewBox="0 0 ${ANCHO} ${ALTO}"><defs>${defs}</defs>${cuerpo}</svg>`;
}

function gradiente(id, c1, c2, vertical = false) {
    const coords = vertical ? 'x1="0" y1="0" x2="0" y2="1"' : 'x1="0" y1="0" x2="1" y2="1"';
    return `<linearGradient id="${id}" ${coords}><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>`;
}

// Mezcla un color hex con blanco (t=0 color original, t=1 blanco)
function aclarar(hex, t) {
    const h = hex.replace('#', '');
    const n = Number.parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    const mix = c => Math.round(c + (255 - c) * t);
    return `#${[mix(r), mix(g), mix(b)].map(c => c.toString(16).padStart(2, '0')).join('')}`;
}

// ---- Catálogo ----

const PLANTILLAS = [
    {
        id: 'clasico',
        nombre: 'Clásico',
        titulo: 'Un regalo para ti',
        mensajeSugerido: 'Disfruta una experiencia deliciosa por nuestra cuenta.',
        usaColorNegocio: true,
        paleta: { titulo: '#1e293b', texto: '#334155', suave: '#64748b', acento: null },
        fondo: color => {
            const claro = aclarar(color, 0.93);
            const medio = aclarar(color, 0.55);
            // Franja superior de color (ahí va el nombre del negocio, en blanco).
            return svg(
                gradiente('g', '#ffffff', claro),
                `<rect width="${ANCHO}" height="${ALTO}" fill="url(#g)"/>
                <rect x="0" y="0" width="${ANCHO}" height="86" fill="${color}"/>
                <circle cx="250" cy="-30" r="90" fill="#ffffff" fill-opacity="0.08"/>
                <circle cx="320" cy="100" r="60" fill="${medio}" fill-opacity="0.18"/>
                <circle cx="${ANCHO + 10}" cy="${ALTO + 20}" r="140" fill="${color}" fill-opacity="0.10"/>
                <circle cx="-20" cy="${ALTO + 30}" r="90" fill="${color}" fill-opacity="0.08"/>
                <rect x="0" y="${ALTO - 6}" width="${ANCHO}" height="6" fill="${color}"/>`
            );
        }
    },
    {
        id: 'amor_amistad',
        nombre: 'Amor y Amistad',
        titulo: 'Feliz Amor y Amistad',
        mensajeSugerido: 'Porque los mejores momentos se comparten en la mesa.',
        paleta: { titulo: '#9f1239', texto: '#4c0519', suave: '#9f1239', acento: '#e11d48' },
        fondo: () =>
            svg(
                gradiente('g', '#fff1f3', '#ffd6de'),
                `<rect width="${ANCHO}" height="${ALTO}" fill="url(#g)"/>
                ${corazon(28, 36, 46, '#e11d48', 0.9, -15)}
                ${corazon(78, 18, 24, '#fb7185', 0.8, 12)}
                ${corazon(300, 30, 18, '#fda4af', 0.9, 20)}
                ${corazon(250, 312, 26, '#fb7185', 0.55, -10)}
                ${corazon(20, 300, 34, '#e11d48', 0.25, 15)}
                ${corazon(ANCHO - 20, 40, 60, '#e11d48', 0.18, 20)}
                ${corazon(ANCHO - 60, ALTO - 20, 70, '#fb7185', 0.22, -12)}
                ${corazon(330, 190, 14, '#e11d48', 0.35, 8)}
                <path d="M0 ${ALTO - 40} C140 ${ALTO - 80} 260 ${ALTO} ${ANCHO} ${ALTO - 50} L${ANCHO} ${ALTO} L0 ${ALTO} Z" fill="#fecdd3" fill-opacity="0.6"/>`
            )
    },
    {
        id: 'dia_padre',
        nombre: 'Día del Padre',
        titulo: 'Feliz Día del Padre',
        mensajeSugerido: 'Para el mejor papá, una comida a su altura.',
        paleta: { titulo: '#f5d48a', texto: '#e2e8f0', suave: '#cbd5e1', acento: '#b8862f' },
        fondo: () =>
            svg(
                gradiente('g', '#0f2744', '#1d3b63'),
                `<rect width="${ANCHO}" height="${ALTO}" fill="url(#g)"/>
                <g stroke="#d4a24c" stroke-opacity="0.18" stroke-width="10">
                    <line x1="-40" y1="${ALTO}" x2="140" y2="-20"/><line x1="0" y1="${ALTO + 20}" x2="190" y2="-20"/>
                </g>
                <line x1="24" y1="${ALTO - 34}" x2="320" y2="${ALTO - 34}" stroke="#d4a24c" stroke-opacity="0.6" stroke-width="1"/>
                <g transform="translate(300 28) scale(0.9)" fill="#d4a24c" fill-opacity="0.9">
                    <polygon points="0,0 20,0 16,12 4,12"/>
                    <polygon points="4,12 16,12 24,62 10,78 -4,62"/>
                </g>
                ${estrella(270, 70, 5, '#f5d48a', 0.8)}${estrella(330, 110, 3.5, '#f5d48a', 0.6)}
                ${estrella(40, 26, 4, '#f5d48a', 0.7)}
                <circle cx="${ANCHO + 30}" cy="-30" r="130" fill="#d4a24c" fill-opacity="0.12"/>`
            )
    },
    {
        id: 'dia_madre',
        nombre: 'Día de la Madre',
        titulo: 'Feliz Día de la Madre',
        mensajeSugerido: 'Para la reina de la casa, con todo nuestro cariño.',
        paleta: { titulo: '#9d174d', texto: '#500724', suave: '#9d174d', acento: '#db2777' },
        fondo: () =>
            svg(
                gradiente('g', '#fdf2f8', '#f3e8ff'),
                `<rect width="${ANCHO}" height="${ALTO}" fill="url(#g)"/>
                ${hoja(18, 60, 50, -40, '#86efac', 0.7)}${hoja(40, 30, 44, 10, '#4ade80', 0.5)}
                ${flor(40, 40, 16, '#f9a8d4', '#fde68a', 0.95)}
                ${flor(92, 20, 9, '#d8b4fe', '#fde68a', 0.9)}
                ${flor(300, 36, 10, '#f9a8d4', '#fde68a', 0.8)}
                ${hoja(ANCHO - 90, ALTO - 30, 60, -150, '#86efac', 0.45)}
                ${flor(ANCHO - 40, ALTO - 30, 26, '#f9a8d4', '#fde68a', 0.35)}
                ${flor(30, ALTO - 26, 14, '#d8b4fe', '#fde68a', 0.5)}
                ${flor(320, ALTO - 20, 8, '#f9a8d4', '#fde68a', 0.6)}`
            )
    },
    {
        id: 'cumpleanos',
        nombre: 'Cumpleaños',
        titulo: '¡Feliz Cumpleaños!',
        mensajeSugerido: 'Celebra tu día con algo delicioso. ¡Invitamos nosotros!',
        paleta: { titulo: '#6d28d9', texto: '#2e1065', suave: '#6d28d9', acento: '#7c3aed' },
        fondo: () =>
            svg(
                gradiente('g', '#fffbeb', '#ede9fe'),
                `<rect width="${ANCHO}" height="${ALTO}" fill="url(#g)"/>
                ${confeti(7, ['#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'], 26, { x: 0, y: 0, w: 340, h: 60 })}
                ${confeti(19, ['#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'], 14, { x: 0, y: ALTO - 22, w: 340, h: 18 })}
                ${globo(300, 40, 16, '#f43f5e', 0.9)}${globo(328, 62, 12, '#3b82f6', 0.85)}
                ${globo(ANCHO - 30, ALTO - 90, 22, '#f59e0b', 0.35)}`
            )
    },
    {
        id: 'navidad',
        nombre: 'Navidad',
        titulo: 'Feliz Navidad',
        mensajeSugerido: 'Que esta Navidad llegue con sabor y buena compañía.',
        paleta: { titulo: '#fde68a', texto: '#ecfdf5', suave: '#bbf7d0', acento: '#b91c1c' },
        fondo: () =>
            svg(
                gradiente('g', '#14532d', '#0b3b20'),
                `<rect width="${ANCHO}" height="${ALTO}" fill="url(#g)"/>
                ${copoNieve(18, 18, 12, '#ffffff', 0.7)}${copoNieve(250, 36, 7, '#ffffff', 0.6)}
                ${copoNieve(290, 28, 9, '#ffffff', 0.7)}${copoNieve(250, 80, 5, '#ffffff', 0.5)}
                ${copoNieve(330, ALTO - 150, 8, '#ffffff', 0.4)}${copoNieve(310, ALTO - 60, 6, '#ffffff', 0.5)}
                ${copoNieve(ANCHO - 30, 30, 10, '#ffffff', 0.5)}
                <rect x="0" y="${ALTO - 14}" width="${ANCHO}" height="14" fill="#b91c1c"/>
                <rect x="0" y="${ALTO - 14}" width="${ANCHO}" height="3" fill="#fde68a" fill-opacity="0.7"/>
                ${estrella(318, 48, 12, '#fde68a', 0.95)}`
            )
    },
    {
        id: 'ano_nuevo',
        nombre: 'Año Nuevo',
        titulo: 'Feliz Año Nuevo',
        mensajeSugerido: 'Brindemos por un año lleno de buenos momentos.',
        paleta: { titulo: '#f5c451', texto: '#f1f5f9', suave: '#cbd5e1', acento: '#b8892a' },
        fondo: () =>
            svg(
                gradiente('g', '#0b0b12', '#241b3a'),
                `<rect width="${ANCHO}" height="${ALTO}" fill="url(#g)"/>
                ${destello(40, 34, 14, '#f5c451', 0.95)}${destello(80, 70, 7, '#f5c451', 0.7)}
                ${destello(300, 30, 10, '#f5c451', 0.85)}${destello(260, 76, 5, '#ffffff', 0.7)}
                ${destello(320, 96, 4, '#ffffff', 0.6)}${destello(ANCHO - 30, 40, 12, '#f5c451', 0.4)}
                ${destello(30, ALTO - 36, 6, '#f5c451', 0.5)}
                <circle cx="150" cy="20" r="1.6" fill="#ffffff" fill-opacity="0.8"/><circle cx="200" cy="44" r="1.2" fill="#ffffff" fill-opacity="0.7"/>
                <circle cx="120" cy="${ALTO - 20}" r="1.4" fill="#ffffff" fill-opacity="0.6"/>
                <line x1="24" y1="${ALTO - 34}" x2="320" y2="${ALTO - 34}" stroke="#f5c451" stroke-opacity="0.5" stroke-width="1"/>`
            )
    },
    {
        id: 'halloween',
        nombre: 'Halloween',
        titulo: 'Feliz Halloween',
        mensajeSugerido: 'Un bono de miedo... ¡pero delicioso!',
        paleta: { titulo: '#fb923c', texto: '#f5f3ff', suave: '#ddd6fe', acento: '#ea580c' },
        fondo: () =>
            svg(
                gradiente('g', '#1c1027', '#3b1a5a'),
                `<rect width="${ANCHO}" height="${ALTO}" fill="url(#g)"/>
                <circle cx="300" cy="46" r="30" fill="#fdba74" fill-opacity="0.95"/>
                <circle cx="312" cy="38" r="28" fill="#2a1540" fill-opacity="0.9"/>
                ${murcielago(60, 30, 1.2, '#0b0612', 0.9)}${murcielago(240, 60, 0.8, '#0b0612', 0.8)}
                ${murcielago(ANCHO - 60, ALTO - 60, 1.6, '#0b0612', 0.5)}
                <path d="M0 ${ALTO} L0 ${ALTO - 26} Q40 ${ALTO - 44} 80 ${ALTO - 28} Q140 ${ALTO - 50} 200 ${ALTO - 26} Q260 ${ALTO - 44} 340 ${ALTO - 24} Q440 ${ALTO - 8} ${ANCHO} ${ALTO - 30} L${ANCHO} ${ALTO} Z" fill="#0b0612" fill-opacity="0.7"/>`
            )
    },
    {
        id: 'gracias',
        nombre: 'Agradecimiento',
        titulo: '¡Gracias por preferirnos!',
        mensajeSugerido: 'Un detalle para uno de nuestros clientes favoritos.',
        paleta: { titulo: '#065f46', texto: '#022c22', suave: '#047857', acento: '#059669' },
        fondo: () =>
            svg(
                gradiente('g', '#f0fdf4', '#d1fae5'),
                `<rect width="${ANCHO}" height="${ALTO}" fill="url(#g)"/>
                ${hoja(-10, 40, 90, -20, '#10b981', 0.55)}${hoja(10, 80, 70, 10, '#34d399', 0.4)}
                ${hoja(20, 10, 60, -60, '#059669', 0.5)}
                ${hoja(ANCHO + 10, ALTO - 30, 110, 200, '#10b981', 0.3)}
                ${hoja(300, 30, 40, 30, '#34d399', 0.5)}
                <circle cx="${ANCHO - 40}" cy="30" r="70" fill="#34d399" fill-opacity="0.15"/>`
            )
    }
];

const PLANTILLA_DEFECTO = 'clasico';

function obtener(id) {
    return PLANTILLAS.find(p => p.id === id) || PLANTILLAS.find(p => p.id === PLANTILLA_DEFECTO);
}

/** Lista para el formulario de emisión (con el fondo SVG como miniatura). */
function listarParaUI(colorNegocio) {
    // Mismos colores que resuelve BonoComprobanteService, para que la vista previa
    // del formulario coincida con el PDF.
    return PLANTILLAS.map(p => ({
        id: p.id,
        nombre: p.nombre,
        titulo: p.titulo,
        mensajeSugerido: p.mensajeSugerido,
        colores: {
            titulo: p.usaColorNegocio ? colorNegocio : p.paleta.titulo,
            nombre: p.usaColorNegocio ? '#ffffff' : p.paleta.texto,
            texto: p.paleta.texto,
            suave: p.paleta.suave,
            acento: p.paleta.acento || colorNegocio
        },
        svg: p.fondo(colorNegocio)
    }));
}

module.exports = { PLANTILLAS, PLANTILLA_DEFECTO, ANCHO, ALTO, obtener, listarParaUI, aclarar };
