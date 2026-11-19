const GroqVision = require('../../../services/Tenant/Asistente/llm/GroqVision');
const { crearLectorImagenes, MODELO_VISION_DEFECTO } = require('../../../services/Tenant/Asistente/llm');

const IMAGEN = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]);
const ENTRADA = { imagen: IMAGEN, mime: 'image/jpeg', sistema: 'SIS', instruccion: 'INS' };

const respuesta = (cuerpo, { ok = true, status = 200, headers = {} } = {}) => ({
    ok,
    status,
    headers: { get: nombre => headers[nombre.toLowerCase()] ?? null },
    json: async () => cuerpo
});

describe('GroqVision.leer', () => {
    it('envía la imagen como data URL con modelo, JSON mode y la clave en el encabezado', async () => {
        const fetchImpl = jest
            .fn()
            .mockResolvedValue(respuesta({ choices: [{ message: { content: '{"productos":[]}' } }] }));
        const visor = new GroqVision({ apiKey: 'CLAVE', model: 'modelo-x', fetchImpl });

        await expect(visor.leer(ENTRADA)).resolves.toBe('{"productos":[]}');

        const [url, opciones] = fetchImpl.mock.calls[0];
        expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
        expect(opciones.headers.Authorization).toBe('Bearer CLAVE');
        const cuerpo = JSON.parse(opciones.body);
        expect(cuerpo).toMatchObject({
            model: 'modelo-x',
            temperature: 0,
            stream: false,
            response_format: { type: 'json_object' }
        });
        expect(cuerpo.messages[0]).toEqual({ role: 'system', content: 'SIS' });
        expect(cuerpo.messages[1].content[0]).toEqual({ type: 'text', text: 'INS' });
        expect(cuerpo.messages[1].content[1].image_url.url).toBe(`data:image/jpeg;base64,${IMAGEN.toString('base64')}`);
    });

    it('sin clave no llama a la red', async () => {
        const fetchImpl = jest.fn();
        const visor = new GroqVision({ apiKey: '', model: 'm', fetchImpl });
        await expect(visor.leer(ENTRADA)).rejects.toMatchObject({ codigo: 'no_configurado' });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it.each([
        [{ imagen: Buffer.alloc(0), mime: 'image/jpeg' }],
        [{ imagen: IMAGEN, mime: 'application/pdf' }],
        [{ imagen: 'no es un buffer', mime: 'image/jpeg' }]
    ])('rechaza entradas inválidas sin llamar a la red', async entrada => {
        const fetchImpl = jest.fn();
        const visor = new GroqVision({ apiKey: 'K', model: 'm', fetchImpl });
        await expect(visor.leer({ ...ENTRADA, ...entrada })).rejects.toMatchObject({ codigo: 'respuesta_invalida' });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('traduce el 429 con el tiempo de espera', async () => {
        const fetchImpl = jest
            .fn()
            .mockResolvedValue(respuesta({}, { ok: false, status: 429, headers: { 'retry-after': '12' } }));
        const visor = new GroqVision({ apiKey: 'K', model: 'm', fetchImpl });
        await expect(visor.leer(ENTRADA)).rejects.toMatchObject({ codigo: 'limite', reintentarEnSegundos: 12 });
    });

    it('un error del proveedor no filtra su cuerpo ni la clave', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
        const fetchImpl = jest
            .fn()
            .mockResolvedValue(respuesta({ error: 'secreto-del-proveedor' }, { ok: false, status: 500 }));
        const visor = new GroqVision({ apiKey: 'CLAVE-SECRETA', model: 'm', fetchImpl });
        const error = await visor.leer(ENTRADA).catch(e => e);
        expect(error.codigo).toBe('proveedor');
        expect(error.message).not.toMatch(/secreto|CLAVE/);
        console.error.mockRestore();
    });

    it('una respuesta sin contenido es inválida', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(respuesta({ choices: [{ message: { content: '  ' } }] }));
        const visor = new GroqVision({ apiKey: 'K', model: 'm', fetchImpl });
        await expect(visor.leer(ENTRADA)).rejects.toMatchObject({ codigo: 'respuesta_invalida' });
    });

    it('vence el tiempo máximo', async () => {
        const fetchImpl = jest.fn(
            (_url, { signal }) =>
                new Promise((_resolve, reject) =>
                    signal.addEventListener('abort', () =>
                        reject(Object.assign(new Error('x'), { name: 'AbortError' }))
                    )
                )
        );
        const visor = new GroqVision({ apiKey: 'K', model: 'm', timeoutMs: 20, fetchImpl });
        await expect(visor.leer(ENTRADA)).rejects.toMatchObject({ codigo: 'timeout' });
    });
});

describe('crearLectorImagenes', () => {
    it('usa el modelo por defecto y permite fijarlo por entorno', () => {
        expect(crearLectorImagenes({ GROQ_API_KEY: ' k ' }).model).toBe(MODELO_VISION_DEFECTO);
        expect(crearLectorImagenes({ GROQ_API_KEY: 'k', GROQ_VISION_MODEL: 'otro/modelo' }).model).toBe('otro/modelo');
        expect(crearLectorImagenes({ GROQ_API_KEY: ' k ' }).apiKey).toBe('k');
    });
});
