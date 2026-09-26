/**
 * BonoComprobanteService - Genera el comprobante visual de un bono (PDF tipo
 * "gift card": plantilla temática, logo, dedicatoria, valor, vigencia y un QR
 * con el código) y lo sube a Cloudflare R2 (carpeta 'bonos/'). Se llama desde
 * BonoService.crear de forma no bloqueante -- si falla, el bono igual queda
 * emitido, solo sin comprobante (se puede regenerar desde el detalle del bono).
 *
 * Los diseños viven en BonoPlantillas.js.
 */
const QRCode = require('qrcode');
const PdfMaker = require('../Shared/PdfMaker');
const R2StorageService = require('./R2StorageService');
const TenantRepository = require('../../repositories/Admin/TenantRepository');
const BonoPlantillas = require('./BonoPlantillas');
const { formatMoney } = require('../../utils/money');

const COLOR_PRIMARIO_DEFECTO = '#6366f1';
const { ANCHO, ALTO } = BonoPlantillas;

// Panel blanco de la derecha (valor + QR + código)
const PANEL = { x: 362, y: 22, w: 156, h: ALTO - 44 };
// Ancho de la columna de texto de la izquierda (hasta antes del panel)
const ANCHO_TEXTO = PANEL.x - 24 - 20;

const SIN_BORDES = {
    defaultBorder: false,
    paddingLeft: () => 0,
    paddingRight: () => 0,
    paddingTop: () => 0,
    paddingBottom: () => 0
};

/**
 * Ubica un bloque de texto en (x, y) con un ancho fijo. pdfmake ignora `width`
 * (y el margen) en nodos con absolutePosition: centra y corta línea contra el
 * borde de la página. Una tabla de una celda sí respeta el ancho.
 */
function enCaja(nodo, x, y, ancho) {
    return { table: { widths: [ancho], body: [[nodo]] }, layout: SIN_BORDES, absolutePosition: { x, y } };
}

function esPng(buf) {
    return buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
}

function esJpeg(buf) {
    return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

/**
 * Convierte el logo del tenant a un data URI PNG/JPEG que pdfmake pueda dibujar.
 *
 * pdfmake (via pdfkit) solo decodifica PNG y JPEG, y PdfMaker bloquea el acceso
 * a red, así que hay que traer el logo nosotros. Antes se decidía el formato por
 * el content-type / la extensión declarada y se descartaba todo lo demás, por
 * eso los logos WebP/GIF (permitidos al subirlo en Configuración) o guardados
 * como 'jpg' nunca salían. Ahora se mira el contenido real del archivo y lo que
 * no sea PNG/JPEG se convierte a PNG con sharp (si está disponible).
 */
async function obtenerLogoDataUri(logoSrc) {
    if (!logoSrc) {
        return null;
    }
    try {
        let buffer;
        if (logoSrc.startsWith('data:')) {
            const base64 = logoSrc.split(',')[1] || '';
            buffer = Buffer.from(base64, 'base64');
        } else {
            const res = await fetch(logoSrc);
            if (!res.ok) {
                console.error(`Logo del bono: no se pudo descargar (${res.status}) ${logoSrc}`);
                return null;
            }
            buffer = Buffer.from(await res.arrayBuffer());
        }

        let sharp = null;
        try {
            sharp = require('sharp');
        } catch {
            // Sin sharp (p. ej. build de escritorio): solo PNG/JPEG nativos.
        }

        if (sharp) {
            // Normaliza a PNG de tamaño razonable: soporta WebP/GIF/etc. y evita
            // incrustar un logo de varios MB en cada comprobante.
            const png = await sharp(buffer)
                .resize(240, 240, { fit: 'inside', withoutEnlargement: true })
                .png()
                .toBuffer();
            return `data:image/png;base64,${png.toString('base64')}`;
        }
        if (esPng(buffer)) {
            return `data:image/png;base64,${buffer.toString('base64')}`;
        }
        if (esJpeg(buffer)) {
            return `data:image/jpeg;base64,${buffer.toString('base64')}`;
        }
        console.error('Logo del bono: formato no soportado sin sharp (solo PNG/JPEG)');
        return null;
    } catch (error) {
        console.error('No se pudo preparar el logo para el comprobante del bono:', error.message);
        return null;
    }
}

function recortar(texto, max) {
    const t = String(texto || '').trim();
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

class BonoComprobanteService {
    /**
     * Genera el comprobante y lo sube a R2.
     * @param {number} tenantId
     * @param {object} bono - { codigo, origen, valor_inicial, fecha_vencimiento, plantilla, destinatario, remitente, mensaje }
     * @returns {Promise<string|null>} URL pública en R2, o null si no se pudo generar
     */
    static async generar(tenantId, bono) {
        try {
            const buffer = await BonoComprobanteService.renderBuffer(tenantId, bono);
            return await R2StorageService.uploadFile(buffer, `bono-${bono.codigo}.pdf`, 'application/pdf', 'bonos');
        } catch (error) {
            console.error('Error al generar el comprobante del bono (no bloqueante):', error.message);
            return null;
        }
    }

    /** Solo genera el PDF (sin subirlo): lo usa también la vista previa del formulario. */
    static async renderBuffer(tenantId, bono) {
        const tenant = await TenantRepository.findById(tenantId);
        const colorNegocio = tenant?.config?.colores?.primary || COLOR_PRIMARIO_DEFECTO;
        const [qrDataUrl, logoDataUri] = await Promise.all([
            QRCode.toDataURL(bono.codigo, { margin: 1, width: 300 }),
            obtenerLogoDataUri(tenant?.logo_src)
        ]);
        const docDefinition = BonoComprobanteService._docDefinition(tenant, bono, colorNegocio, qrDataUrl, logoDataUri);
        return PdfMaker.renderPdf(docDefinition);
    }

    static _docDefinition(tenant, bono, colorNegocio, qrDataUrl, logoDataUri) {
        const plantilla = BonoPlantillas.obtener(bono.plantilla);
        const paleta = plantilla.paleta;
        const acento = paleta.acento || colorNegocio;
        // En la plantilla clásica el título toma el color del negocio.
        const colorTitulo = plantilla.usaColorNegocio ? colorNegocio : paleta.titulo;

        const nombreNegocio = recortar(tenant?.nombre || 'Tu negocio', 34);
        const etiqueta = bono.origen === 'regalo' ? 'BONO DE REGALO' : 'BONO REDIMIBLE';
        const vigencia = bono.fecha_vencimiento
            ? `Válido hasta el ${new Date(bono.fecha_vencimiento).toLocaleDateString('es-CO', {
                  timeZone: 'UTC',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
              })}`
            : 'Sin fecha de vencimiento';

        const destinatario = recortar(bono.destinatario, 40);
        const remitente = recortar(bono.remitente, 40);
        // Sin mensaje propio se usa el sugerido de la plantilla: un bono temático
        // con solo el título se ve vacío.
        const mensaje = recortar(bono.mensaje, 150) || plantilla.mensajeSugerido;

        // Encabezado: logo en un círculo blanco (se ve sobre cualquier fondo) + nombre.
        // En la plantilla clásica el encabezado va sobre la franja de color, en
        // blanco; en las demás, con el color del texto de la plantilla.
        const colorNombre = plantilla.usaColorNegocio ? '#ffffff' : paleta.texto;
        const encabezado = [];
        let xNombre = 24;
        if (logoDataUri) {
            encabezado.push(
                {
                    canvas: [{ type: 'ellipse', x: 52, y: 50, r1: 30, r2: 30, color: '#ffffff' }],
                    absolutePosition: { x: 0, y: 0 }
                },
                { image: logoDataUri, fit: [42, 42], absolutePosition: { x: 31, y: 29 } }
            );
            xNombre = 92;
        }
        encabezado.push(
            {
                text: nombreNegocio,
                color: colorNombre,
                fontSize: 13,
                bold: true,
                absolutePosition: { x: xNombre, y: 36 }
            },
            {
                text: etiqueta,
                color: colorNombre,
                fontSize: 7.5,
                characterSpacing: 1.5,
                opacity: 0.85,
                absolutePosition: { x: xNombre, y: 54 }
            }
        );

        // Cuerpo izquierdo: título + dedicatoria + mensaje
        const cuerpo = [
            enCaja(
                {
                    text: plantilla.titulo,
                    color: colorTitulo,
                    fontSize: plantilla.titulo.length > 20 ? 22 : 26,
                    bold: true,
                    italics: true
                },
                24,
                112,
                ANCHO_TEXTO
            )
        ];
        let y = 160;
        if (destinatario || remitente) {
            const partes = [];
            if (destinatario) {
                partes.push(
                    { text: 'Para: ', color: paleta.suave, bold: true },
                    { text: destinatario, color: paleta.texto }
                );
            }
            if (destinatario && remitente) {
                partes.push({ text: '     ' });
            }
            if (remitente) {
                partes.push(
                    { text: 'De: ', color: paleta.suave, bold: true },
                    { text: remitente, color: paleta.texto }
                );
            }
            cuerpo.push(enCaja({ text: partes, fontSize: 10.5 }, 24, y, ANCHO_TEXTO));
            y += 22;
        }
        if (mensaje) {
            cuerpo.push(
                enCaja(
                    { text: `“${mensaje}”`, italics: true, fontSize: 10, color: paleta.texto, lineHeight: 1.25 },
                    24,
                    y,
                    ANCHO_TEXTO
                )
            );
        }

        const pie = [
            enCaja({ text: vigencia, fontSize: 8.5, color: paleta.suave }, 24, ALTO - 60, ANCHO_TEXTO),
            enCaja(
                {
                    text: `Presenta este bono (código o QR) al pagar en ${nombreNegocio}.`,
                    fontSize: 7.5,
                    color: paleta.suave
                },
                24,
                ALTO - 46,
                ANCHO_TEXTO
            )
        ];

        // Panel blanco derecho: valor, QR y código
        const cx = PANEL.x + PANEL.w / 2;
        const panel = [
            {
                canvas: [
                    {
                        type: 'rect',
                        x: PANEL.x + 2,
                        y: PANEL.y + 3,
                        w: PANEL.w,
                        h: PANEL.h,
                        r: 14,
                        color: '#000000',
                        fillOpacity: 0.12
                    },
                    { type: 'rect', x: PANEL.x, y: PANEL.y, w: PANEL.w, h: PANEL.h, r: 14, color: '#ffffff' }
                ],
                absolutePosition: { x: 0, y: 0 }
            },
            enCaja(
                { text: 'VALOR', fontSize: 7.5, color: '#94a3b8', characterSpacing: 1.5, alignment: 'center' },
                PANEL.x,
                PANEL.y + 16,
                PANEL.w
            ),
            enCaja(
                { text: formatMoney(bono.valor_inicial), fontSize: 20, bold: true, color: acento, alignment: 'center' },
                PANEL.x,
                PANEL.y + 28,
                PANEL.w
            ),
            { image: qrDataUrl, width: 112, absolutePosition: { x: cx - 56, y: PANEL.y + 70 } },
            enCaja(
                { text: 'CÓDIGO', fontSize: 7, color: '#94a3b8', characterSpacing: 1.5, alignment: 'center' },
                PANEL.x,
                PANEL.y + 192,
                PANEL.w
            ),
            enCaja(
                {
                    text: bono.codigo,
                    fontSize: 13,
                    bold: true,
                    color: '#0f172a',
                    characterSpacing: 1,
                    alignment: 'center'
                },
                PANEL.x,
                PANEL.y + 204,
                PANEL.w
            ),
            {
                canvas: [
                    {
                        type: 'line',
                        x1: PANEL.x + 24,
                        y1: PANEL.y + 234,
                        x2: PANEL.x + PANEL.w - 24,
                        y2: PANEL.y + 234,
                        lineWidth: 0.5,
                        lineColor: '#e2e8f0'
                    }
                ],
                absolutePosition: { x: 0, y: 0 }
            },
            enCaja(
                { text: 'Escanéalo al pagar', fontSize: 7, color: '#94a3b8', alignment: 'center' },
                PANEL.x,
                PANEL.y + 244,
                PANEL.w
            )
        ];

        return {
            pageSize: { width: ANCHO, height: ALTO },
            pageMargins: [0, 0, 0, 0],
            info: { title: `Bono ${bono.codigo} - ${nombreNegocio}` },
            content: [
                { svg: plantilla.fondo(colorNegocio), width: ANCHO, height: ALTO, absolutePosition: { x: 0, y: 0 } },
                ...encabezado,
                ...cuerpo,
                ...pie,
                ...panel
            ]
        };
    }
}

module.exports = BonoComprobanteService;
