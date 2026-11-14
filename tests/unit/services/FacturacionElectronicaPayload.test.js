jest.mock('../../../repositories/Tenant/FacturaElectronicaRepository', () => ({}));
jest.mock('../../../services/Tenant/FacturacionElectronicaConfigService', () => ({}));
jest.mock('../../../services/Integrations/Factus/FactusClient', () => jest.fn());
jest.mock('../../../utils/logger', () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }));

const FacturacionElectronicaService = require('../../../services/Tenant/FacturacionElectronicaService');

const feConfig = { numbering_range_id: '8' };
const factura = { numero: 41, forma_pago: 'efectivo', numero_documento: null };

describe('FacturacionElectronicaService.mapearPayload', () => {
    it('el precio enviado a Factus es el EFECTIVO cobrado: precio x cantidad = subtotal de la línea con descuento', () => {
        // Así guardan detalle_factura los dos motores: precio_unitario = subtotal / cantidad (ya descontado) y el
        // precio de lista va aparte en precio_original. Por eso discount_rate va en 0: descontar otra vez
        // declararía de menos ante la DIAN.
        const detalle = {
            cantidad: 2,
            precio_unitario: 9000, // lista 10.000 con 10 % de descuento
            subtotal: 18000,
            tasa_impuesto: 8,
            nombre: 'Café'
        };
        const { items } = FacturacionElectronicaService.mapearPayload(factura, [detalle], feConfig);
        expect(items[0].price * items[0].quantity).toBe(detalle.subtotal);
        expect(items[0].discount_rate).toBe(0);
        expect(items[0].tax_rate).toBe('8.00');
    });

    it('sin documento del cliente factura a consumidor final', () => {
        const payload = FacturacionElectronicaService.mapearPayload(factura, [], feConfig);
        expect(payload.customer).toMatchObject({ identification: '222222222222', names: 'Consumidor Final' });
        expect(payload.reference_code).toBe('FAC-41');
    });

    it('con documento usa los datos del cliente y el tipo NIT/cédula', () => {
        const nit = { ...factura, numero_documento: '900123', tipo_documento: 'NIT', cliente_nombre: 'ACME' };
        const { customer } = FacturacionElectronicaService.mapearPayload(nit, [], feConfig);
        expect(customer).toMatchObject({ identification: '900123', identification_document_id: 6, names: 'ACME' });
    });
});
