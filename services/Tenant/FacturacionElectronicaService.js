/**
 * FacturacionElectronicaService - Mapeo de una factura interna al payload de Factus
 * y orquestación de la emisión (Fase 3 del plan). El worker de emisión
 * (FacturacionElectronicaWorkerService) es quien invoca `emitir` por cada fila
 * pendiente en la cola `facturas_electronicas`.
 *
 * NOTA: el nombre exacto de los campos del payload debe confirmarse contra el
 * sandbox real de Factus (riesgo señalado en la Fase 0 del plan). Esta
 * implementación sigue la forma documentada públicamente por Factus.
 */

const FacturaElectronicaRepository = require('../../repositories/Tenant/FacturaElectronicaRepository');
const FacturacionElectronicaConfigService = require('./FacturacionElectronicaConfigService');
const FactusClient = require('../Integrations/Factus/FactusClient');
const logger = require('../../utils/logger');

const DOCUMENTO_CONSUMIDOR_FINAL = '222222222222';

const TRIBUTO_A_CODIGO_FACTUS = {
    iva_19: '01',
    iva_5: '01',
    impoconsumo_8: '04',
    exento: '01',
    excluido: 'ZZ'
};

class FacturacionElectronicaService {
    /**
     * Arma el payload de creación de factura para la API de Factus a partir de
     * los datos internos de la venta.
     * @param {Object} factura - Fila devuelta por FacturaElectronicaRepository.getFacturaCompletaParaEmision
     * @param {Array} detalles
     * @param {Object} feConfig - Config fiscal del tenant (numbering range, etc.)
     * @returns {Object}
     */
    static mapearPayload(factura, detalles, feConfig) {
        const tieneDocumento = !!factura.numero_documento;

        const items = detalles.map(d => {
            const cantidad = Number(d.cantidad) || 0;
            const precioUnitario = Number(d.precio_unitario) || 0;
            const tasa = Number(d.tasa_impuesto) || 0;
            return {
                name: d.nombre || (d.es_servicio ? 'Servicio' : 'Producto'),
                quantity: cantidad,
                unit_measure: d.es_servicio ? '94' : '70', // 70 = unidad, 94 = servicio (código UN/CEFACT usado por Factus)
                price: precioUnitario,
                discount_rate: 0,
                tax_rate: tasa.toFixed(2),
                withholding_taxes: []
            };
        });

        return {
            numbering_range_id: feConfig.numbering_range_id ? Number(feConfig.numbering_range_id) : undefined,
            reference_code: `FAC-${factura.numero}`,
            observation: '',
            payment_form: 'CONTADO',
            payment_method_code: factura.forma_pago === 'transferencia' ? '42' : '10',
            billing_period: undefined,
            customer: tieneDocumento
                ? {
                      identification: factura.numero_documento,
                      identification_document_id: factura.tipo_documento === 'NIT' ? 6 : 3,
                      names: factura.cliente_nombre,
                      address: factura.cliente_direccion || undefined,
                      email: factura.cliente_email || undefined,
                      phone: factura.cliente_telefono || undefined
                  }
                : {
                      identification: DOCUMENTO_CONSUMIDOR_FINAL,
                      identification_document_id: 3,
                      names: 'Consumidor Final'
                  },
            items
        };
    }

    /**
     * Emite ante Factus una factura pendiente en la cola. Actualiza el estado
     * (emitida/error) en `facturas_electronicas` según el resultado.
     * @param {Object} colaRow - Fila de facturas_electronicas (estado='pendiente')
     */
    static async emitir(colaRow) {
        const { id, factura_id: facturaId, tenant_id: tenantId, intentos } = colaRow;

        try {
            const feConfig = await FacturacionElectronicaConfigService.getForAdmin(tenantId);
            if (feConfig.estado !== 'activo') {
                throw new Error('La facturación electrónica no está activa para este tenant');
            }
            if (!feConfig.numbering_range_id) {
                throw new Error('No hay un rango de numeración configurado');
            }

            const datos = await FacturaElectronicaRepository.getFacturaCompletaParaEmision(facturaId, tenantId);
            if (!datos) {
                throw new Error('Factura interna no encontrada');
            }

            const payload = FacturacionElectronicaService.mapearPayload(datos.factura, datos.detalles, feConfig);

            const creds = await FacturacionElectronicaConfigService.getDecryptedForClient(tenantId);
            const client = new FactusClient(creds);
            const respuesta = await client.request('POST', '/v1/bills', payload);

            const bill = respuesta.data || respuesta;
            await FacturaElectronicaRepository.marcarEmitida(id, {
                numero_fe: bill.bill?.number || bill.number || null,
                cufe: bill.bill?.cufe || bill.cufe || null,
                qr_data: bill.bill?.qr || bill.qr || null,
                xml_blob: null,
                pdf_blob: null
            });

            logger.info('Factura electrónica emitida', { tenantId, facturaId });
        } catch (error) {
            logger.error('Error al emitir factura electrónica', {
                tenantId,
                facturaId,
                error: error.message
            });
            await FacturaElectronicaRepository.registrarFallo(id, error.message, intentos);
        }
    }
}

module.exports = FacturacionElectronicaService;
