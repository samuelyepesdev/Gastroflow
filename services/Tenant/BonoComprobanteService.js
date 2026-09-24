/**
 * BonoComprobanteService - Genera el comprobante visual de un bono (PDF tipo
 * "gift card": código, valor, vigencia y un QR con el código) y lo sube a
 * Cloudflare R2 (carpeta 'bonos/'). Se llama desde BonoService.crear, de
 * forma no bloqueante -- si falla, el bono igual queda emitido, solo sin
 * comprobante (se puede regenerar más adelante si hace falta).
 */
const QRCode = require('qrcode');
const PdfMaker = require('../Shared/PdfMaker');
const R2StorageService = require('./R2StorageService');
const TenantRepository = require('../../repositories/Admin/TenantRepository');
const { formatMoney } = require('../../utils/money');

const COLOR_PRIMARIO_DEFECTO = '#6366f1';
const ANCHO = 500;
const ALTO = 315;

/**
 * Descarga el logo del tenant y lo devuelve como data URI para pdfmake --
 * PdfMaker deniega explícitamente el acceso a URLs/red (setUrlAccessPolicy) por
 * seguridad, así que pdfmake nunca puede ir a buscarlo solo, hay que traerlo
 * nosotros. pdfmake (via pdfkit) solo decodifica PNG/JPEG: si el logo se
 * subió en otro formato (gif/webp, permitidos por el uploader de
 * Configuración) se omite en vez de arriesgar que renderPdf reviente por un
 * formato que no puede decodificar.
 */
async function obtenerLogoDataUri(logoSrc) {
    if (!logoSrc) {
        return null;
    }
    if (logoSrc.startsWith('data:image/png') || logoSrc.startsWith('data:image/jpeg')) {
        return logoSrc;
    }
    if (logoSrc.startsWith('data:')) {
        return null;
    }
    try {
        const res = await fetch(logoSrc);
        if (!res.ok) {
            return null;
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (!contentType.includes('png') && !contentType.includes('jpeg') && !contentType.includes('jpg')) {
            return null;
        }
        const buffer = Buffer.from(await res.arrayBuffer());
        return `data:${contentType};base64,${buffer.toString('base64')}`;
    } catch (error) {
        console.error('No se pudo descargar el logo para el comprobante del bono:', error.message);
        return null;
    }
}

class BonoComprobanteService {
    /**
     * @param {number} tenantId
     * @param {object} bono - { codigo, origen, valor_inicial, fecha_vencimiento }
     * @returns {Promise<string|null>} URL pública en R2, o null si no se pudo generar
     */
    static async generar(tenantId, bono) {
        try {
            const tenant = await TenantRepository.findById(tenantId);
            const colorPrimario = tenant?.config?.colores?.primary || COLOR_PRIMARIO_DEFECTO;
            const [qrDataUrl, logoDataUri] = await Promise.all([
                QRCode.toDataURL(bono.codigo, { margin: 1, width: 300 }),
                obtenerLogoDataUri(tenant?.logo_src)
            ]);

            const docDefinition = BonoComprobanteService._docDefinition(
                tenant,
                bono,
                colorPrimario,
                qrDataUrl,
                logoDataUri
            );
            const buffer = await PdfMaker.renderPdf(docDefinition);

            return await R2StorageService.uploadFile(buffer, `bono-${bono.codigo}.pdf`, 'application/pdf', 'bonos');
        } catch (error) {
            console.error('Error al generar el comprobante del bono (no bloqueante):', error.message);
            return null;
        }
    }

    static _docDefinition(tenant, bono, colorPrimario, qrDataUrl, logoDataUri) {
        const nombreNegocio = tenant?.nombre || 'Tu negocio';
        const tituloOrigen = bono.origen === 'regalo' ? 'BONO DE REGALO' : 'BONO REDIMIBLE';
        const vigencia = bono.fecha_vencimiento
            ? `Válido hasta ${new Date(bono.fecha_vencimiento).toLocaleDateString('es-CO', { timeZone: 'UTC' })}`
            : 'Sin fecha de vencimiento';
        // Si hay logo, corremos el texto a la derecha para dejarle su espacio.
        const textoX = logoDataUri ? 84 : 24;

        return {
            pageSize: { width: ANCHO, height: ALTO },
            pageMargins: [0, 0, 0, 0],
            content: [
                { canvas: [{ type: 'rect', x: 0, y: 0, w: ANCHO, h: 84, color: colorPrimario }] },
                ...(logoDataUri ? [{ image: logoDataUri, fit: [48, 48], absolutePosition: { x: 24, y: 18 } }] : []),
                {
                    text: nombreNegocio,
                    color: '#ffffff',
                    fontSize: 16,
                    bold: true,
                    absolutePosition: { x: textoX, y: 20 }
                },
                { text: tituloOrigen, color: '#ffffff', fontSize: 10, absolutePosition: { x: textoX, y: 46 } },

                { text: 'CÓDIGO', fontSize: 9, color: '#94a3b8', absolutePosition: { x: 24, y: 108 } },
                { text: bono.codigo, fontSize: 28, bold: true, color: '#1e293b', absolutePosition: { x: 24, y: 121 } },

                { text: 'VALOR', fontSize: 9, color: '#94a3b8', absolutePosition: { x: 24, y: 168 } },
                {
                    text: formatMoney(bono.valor_inicial),
                    fontSize: 22,
                    bold: true,
                    color: colorPrimario,
                    absolutePosition: { x: 24, y: 180 }
                },

                { text: vigencia, fontSize: 9, color: '#64748b', absolutePosition: { x: 24, y: 214 } },

                { image: qrDataUrl, width: 110, absolutePosition: { x: 358, y: 108 } },

                {
                    text: `Presenta este código o el QR al pagar en ${nombreNegocio}.`,
                    fontSize: 8,
                    color: '#94a3b8',
                    alignment: 'center',
                    width: ANCHO,
                    absolutePosition: { x: 0, y: 292 }
                }
            ]
        };
    }
}

module.exports = BonoComprobanteService;
