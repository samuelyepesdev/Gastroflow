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
            const qrDataUrl = await QRCode.toDataURL(bono.codigo, { margin: 1, width: 300 });

            const docDefinition = BonoComprobanteService._docDefinition(tenant, bono, colorPrimario, qrDataUrl);
            const buffer = await PdfMaker.renderPdf(docDefinition);

            return await R2StorageService.uploadFile(buffer, `bono-${bono.codigo}.pdf`, 'application/pdf', 'bonos');
        } catch (error) {
            console.error('Error al generar el comprobante del bono (no bloqueante):', error.message);
            return null;
        }
    }

    static _docDefinition(tenant, bono, colorPrimario, qrDataUrl) {
        const nombreNegocio = tenant?.nombre || 'Tu negocio';
        const tituloOrigen = bono.origen === 'regalo' ? 'BONO DE REGALO' : 'BONO REDIMIBLE';
        const vigencia = bono.fecha_vencimiento
            ? `Válido hasta ${new Date(bono.fecha_vencimiento).toLocaleDateString('es-CO', { timeZone: 'UTC' })}`
            : 'Sin fecha de vencimiento';

        return {
            pageSize: { width: ANCHO, height: ALTO },
            pageMargins: [0, 0, 0, 0],
            content: [
                { canvas: [{ type: 'rect', x: 0, y: 0, w: ANCHO, h: 84, color: colorPrimario }] },
                { text: nombreNegocio, color: '#ffffff', fontSize: 16, bold: true, absolutePosition: { x: 24, y: 20 } },
                { text: tituloOrigen, color: '#ffffff', fontSize: 10, absolutePosition: { x: 24, y: 46 } },

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
