/**
 * Plantillas del comprobante de bonos: cada diseño debe renderizar un PDF
 * válido (con y sin logo/dedicatoria), y la fecha de vencimiento se normaliza
 * igual venga como Date (producción) o como string (local).
 */
jest.mock('../../../repositories/Admin/TenantRepository', () => ({ findById: jest.fn() }));
jest.mock('../../../services/Tenant/R2StorageService', () => ({ uploadFile: jest.fn() }));

const BonoPlantillas = require('../../../services/Tenant/BonoPlantillas');
const BonoComprobanteService = require('../../../services/Tenant/BonoComprobanteService');
const PdfMaker = require('../../../services/Shared/PdfMaker');
const { toFechaDia } = require('../../../utils/dateHelpers');

// PNG 1x1 transparente
const LOGO_PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('BonoPlantillas', () => {
    test('obtener() cae en la clásica con un id desconocido o vacío', () => {
        expect(BonoPlantillas.obtener('no-existe').id).toBe('clasico');
        expect(BonoPlantillas.obtener(null).id).toBe('clasico');
        expect(BonoPlantillas.obtener('navidad').id).toBe('navidad');
    });

    test('listarParaUI() entrega colores y un SVG por plantilla', () => {
        const lista = BonoPlantillas.listarParaUI('#ff0000');
        expect(lista.length).toBe(BonoPlantillas.PLANTILLAS.length);
        for (const p of lista) {
            expect(p.svg.startsWith('<svg')).toBe(true);
            expect(p.colores.titulo).toMatch(/^#[0-9a-f]{6}$/i);
        }
        // La clásica usa el color del negocio
        expect(lista.find(p => p.id === 'clasico').colores.titulo).toBe('#ff0000');
    });

    test.each(BonoPlantillas.PLANTILLAS.map(p => p.id))('la plantilla %s genera un PDF', async id => {
        const doc = BonoComprobanteService._docDefinition(
            { nombre: 'Café de Prueba' },
            {
                codigo: 'BONO-TEST01',
                origen: 'regalo',
                valor_inicial: 50000,
                fecha_vencimiento: '2026-12-31',
                plantilla: id,
                destinatario: 'Ana',
                remitente: 'Luis',
                mensaje: 'Un mensaje de prueba'
            },
            '#6366f1',
            LOGO_PNG,
            LOGO_PNG
        );
        const buffer = await PdfMaker.renderPdf(doc);
        expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    });

    test('sin mensaje usa el sugerido de la plantilla', () => {
        const doc = BonoComprobanteService._docDefinition(
            { nombre: 'X' },
            { codigo: 'BONO-A', origen: 'comprado', valor_inicial: 1000, plantilla: 'dia_padre' },
            '#6366f1',
            LOGO_PNG,
            null
        );
        expect(JSON.stringify(doc.content)).toContain(BonoPlantillas.obtener('dia_padre').mensajeSugerido);
    });
});

describe('toFechaDia', () => {
    test('Date de mysql2 (medianoche local) -> YYYY-MM-DD', () => {
        expect(toFechaDia(new Date(2026, 11, 31))).toBe('2026-12-31');
    });

    test('string de MySQL local -> YYYY-MM-DD', () => {
        expect(toFechaDia('2026-12-31')).toBe('2026-12-31');
    });

    test('vacíos -> null', () => {
        expect(toFechaDia(null)).toBeNull();
        expect(toFechaDia('')).toBeNull();
        expect(toFechaDia(new Date('x'))).toBeNull();
    });
});
