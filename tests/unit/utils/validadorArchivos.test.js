const { detectarMimeReal, exigirMimeReal, nombreSeguro } = require('../../../utils/validadorArchivos');

const relleno = n => Buffer.alloc(n, 0);
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), relleno(8)]);
const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), relleno(12)]);
const webp = Buffer.concat([Buffer.from('RIFF'), relleno(4), Buffer.from('WEBP'), relleno(4)]);
const pdf = Buffer.concat([Buffer.from('%PDF-1.7'), relleno(8)]);

describe('validadorArchivos', () => {
    test('detecta PNG, JPEG, WebP y PDF por contenido', () => {
        expect(detectarMimeReal(png)).toMatchObject({ mime: 'image/png', ext: '.png', esImagen: true });
        expect(detectarMimeReal(jpg).mime).toBe('image/jpeg');
        expect(detectarMimeReal(webp).mime).toBe('image/webp');
        expect(detectarMimeReal(pdf)).toMatchObject({ mime: 'application/pdf', esImagen: false });
    });

    test('rechaza SVG, HTML y buffers cortos aunque el cliente diga image/png', () => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
        expect(detectarMimeReal(Buffer.from(svg))).toBeNull();
        expect(detectarMimeReal(Buffer.from('<html><script>alert(1)</script></html>'))).toBeNull();
        expect(detectarMimeReal(Buffer.from('abc'))).toBeNull();
        expect(detectarMimeReal(null)).toBeNull();
    });

    test('exigirMimeReal lanza 400 y soloImagenes excluye PDF', () => {
        expect(() => exigirMimeReal(Buffer.from('<svg></svg>........'))).toThrow(/no válido/);
        expect(() => exigirMimeReal(pdf, { soloImagenes: true })).toThrow(/no válido/);
        expect(exigirMimeReal(pdf).mime).toBe('application/pdf');
    });

    test('nombreSeguro quita comillas, barras y saltos de línea', () => {
        expect(nombreSeguro('a"b\r\nc\\d/e.pdf')).toBe('a_b__c_d_e.pdf');
        expect(nombreSeguro('')).toBe('archivo');
    });
});
