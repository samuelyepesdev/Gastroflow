const r2 = require('../../../services/Tenant/R2StorageService');

describe('R2StorageService.uploadFile', () => {
    let enviado;
    beforeEach(() => {
        enviado = null;
        r2.s3Client = { send: jest.fn(async cmd => (enviado = cmd.input)) };
        r2.publicUrl = 'https://cdn.test';
        r2.bucketName = 'b';
    });

    test('rechaza SVG/HTML aunque el cliente declare image/png y no sube nada', async () => {
        await expect(
            r2.uploadFile(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'), 'x.png', 'image/png')
        ).rejects.toThrow(/no válido/);
        expect(r2.s3Client.send).not.toHaveBeenCalled();
    });

    test('usa tipo y extensión reales, nunca el nombre ni el mimetype del cliente', async () => {
        const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8)]);
        const url = await r2.uploadFile(png, 'malo.html', 'text/html', 'logos');
        expect(enviado.ContentType).toBe('image/png');
        expect(enviado.Key).toMatch(/^logos\/\d+-[0-9a-f-]{36}\.png$/);
        expect(url.startsWith('https://cdn.test/logos/')).toBe(true);
    });
});

describe('R2StorageService.eliminarSiHuerfano', () => {
    const db = require('../../../config/database');
    const BASE = 'https://cdn.test/';
    let borrados;

    beforeEach(() => {
        borrados = [];
        r2.s3Client = { send: jest.fn(async cmd => borrados.push(cmd.input.Key)) };
        r2.publicUrl = 'https://cdn.test';
        r2.bucketName = 'b';
        jest.spyOn(db, 'query').mockResolvedValue([[]]);
    });
    afterEach(() => jest.restoreAllMocks());

    test('borra el archivo cuando ninguna tabla lo referencia', async () => {
        expect(await r2.eliminarSiHuerfano(`${BASE}productos/1-abc.png`)).toBe(true);
        expect(borrados).toEqual(['productos/1-abc.png']);
        expect(db.query).toHaveBeenCalledTimes(7); // revisó todas las tablas con URLs
    });

    test('NO borra si otra fila lo sigue usando (p. ej. un combo que comparte la imagen)', async () => {
        db.query.mockImplementation(async sql => (/FROM combos/.test(sql) ? [[{ 1: 1 }]] : [[]]));
        expect(await r2.eliminarSiHuerfano(`${BASE}productos/1-abc.png`)).toBe(false);
        expect(borrados).toEqual([]);
    });

    test('NO borra URLs ajenas al bucket ni carpetas no cubiertas (fidelizacion, brochure)', async () => {
        expect(await r2.eliminarSiHuerfano('https://otro.com/productos/x.png')).toBe(false);
        expect(await r2.eliminarSiHuerfano(`${BASE}fidelizacion/sellos-1.png`)).toBe(false);
        expect(await r2.eliminarSiHuerfano(`${BASE}brochure/x.pdf`)).toBe(false);
        expect(await r2.eliminarSiHuerfano(`${BASE}productos/../logos/x.png`)).toBe(false);
        expect(borrados).toEqual([]);
        expect(db.query).not.toHaveBeenCalled();
    });

    test('si falla la comprobación de referencias, NO borra y no lanza', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
        db.query.mockRejectedValue(new Error('db'));
        await expect(r2.eliminarSiHuerfano(`${BASE}logos/1-a.png`)).resolves.toBe(false);
        expect(borrados).toEqual([]);
    });

    test('url vacía o sin cliente S3 no hace nada', async () => {
        expect(await r2.eliminarSiHuerfano(null)).toBe(false);
        r2.s3Client = null;
        expect(await r2.eliminarSiHuerfano(`${BASE}logos/1-a.png`)).toBe(false);
    });
});
