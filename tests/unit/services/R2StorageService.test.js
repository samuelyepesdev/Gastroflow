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
