const GroqTranscriber = require('../../../services/Tenant/Asistente/llm/GroqTranscriber');
const { crearTranscriptor } = require('../../../services/Tenant/Asistente/llm');
const { LlmError } = require('../../../services/Tenant/Asistente/llm/errores');

const respuesta = ({ ok = true, status = 200, cuerpo = { text: 'hola' }, retryAfter } = {}) => ({
    ok,
    status,
    headers: { get: nombre => (nombre === 'retry-after' ? (retryAfter ?? null) : null) },
    json: async () => {
        if (cuerpo instanceof Error) {
            throw cuerpo;
        }
        return cuerpo;
    }
});

const audio = Buffer.from('audio-de-prueba');

describe('GroqTranscriber', () => {
    let fetchImpl;
    let errorSpy;

    const crear = extra => new GroqTranscriber({ apiKey: 'gsk_secreta', model: 'whisper-x', fetchImpl, ...extra });

    beforeEach(() => {
        fetchImpl = jest.fn().mockResolvedValue(respuesta());
        errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => errorSpy.mockRestore());

    it('envía el audio como multipart al endpoint de transcripciones con la clave en la cabecera', async () => {
        const texto = await crear().transcribir({ audio, mime: 'audio/webm' });

        const [url, opciones] = fetchImpl.mock.calls[0];
        expect(url).toBe('https://api.groq.com/openai/v1/audio/transcriptions');
        expect(opciones.method).toBe('POST');
        expect(opciones.headers.Authorization).toBe('Bearer gsk_secreta');
        // El Content-Type con el boundary lo pone fetch al ver un FormData: no se fija a mano.
        expect(opciones.headers['Content-Type']).toBeUndefined();
        const form = opciones.body;
        expect(form.get('model')).toBe('whisper-x');
        expect(form.get('language')).toBe('es');
        expect(form.get('response_format')).toBe('json');
        expect(form.get('temperature')).toBe('0');
        expect(form.get('file').name).toBe('dictado.webm');
        expect(texto).toBe('hola');
    });

    it.each([
        ['audio/webm;codecs=opus', 'dictado.webm'],
        ['audio/ogg', 'dictado.ogg'],
        ['audio/mp4', 'dictado.mp4'],
        ['audio/mpeg', 'dictado.mp3'],
        ['audio/wav', 'dictado.wav'],
        ['audio/x-m4a', 'dictado.m4a']
    ])('pone al archivo una extensión que Groq reconoce (%s)', async (mime, nombre) => {
        await crear().transcribir({ audio, mime });

        expect(fetchImpl.mock.calls[0][1].body.get('file').name).toBe(nombre);
    });

    it('limpia espacios y devuelve texto vacío si no se entendió nada', async () => {
        fetchImpl.mockResolvedValueOnce(respuesta({ cuerpo: { text: '  cuatro ramen  ' } }));
        expect(await crear().transcribir({ audio, mime: 'audio/webm' })).toBe('cuatro ramen');

        fetchImpl.mockResolvedValueOnce(respuesta({ cuerpo: { text: '   ' } }));
        expect(await crear().transcribir({ audio, mime: 'audio/webm' })).toBe('');
    });

    it('sin clave no llama a Groq', async () => {
        await expect(crear({ apiKey: '' }).transcribir({ audio, mime: 'audio/webm' })).rejects.toMatchObject({
            codigo: 'no_configurado'
        });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('un 429 es "limite" y conserva el retry-after', async () => {
        fetchImpl.mockResolvedValue(respuesta({ ok: false, status: 429, retryAfter: '12' }));

        await expect(crear().transcribir({ audio, mime: 'audio/webm' })).rejects.toMatchObject({
            codigo: 'limite',
            reintentarEnSegundos: 12
        });
    });

    it('otros errores HTTP son "proveedor" y nunca copian el cuerpo ni la clave', async () => {
        fetchImpl.mockResolvedValue(
            respuesta({ ok: false, status: 400, cuerpo: { error: 'detalle interno gsk_secreta' } })
        );

        const error = await crear()
            .transcribir({ audio, mime: 'audio/webm' })
            .catch(e => e);

        expect(error).toBeInstanceOf(LlmError);
        expect(error.codigo).toBe('proveedor');
        expect(error.message).not.toMatch(/gsk_|interno/);
    });

    it('una respuesta que no es JSON o no trae texto es "respuesta_invalida"', async () => {
        fetchImpl.mockResolvedValueOnce(respuesta({ cuerpo: new SyntaxError('x') }));
        await expect(crear().transcribir({ audio, mime: 'audio/webm' })).rejects.toMatchObject({
            codigo: 'respuesta_invalida'
        });

        fetchImpl.mockResolvedValueOnce(respuesta({ cuerpo: { otra: 1 } }));
        await expect(crear().transcribir({ audio, mime: 'audio/webm' })).rejects.toMatchObject({
            codigo: 'respuesta_invalida'
        });
    });

    it('si Groq tarda más del límite responde "timeout"', async () => {
        fetchImpl.mockImplementation(
            (_url, { signal }) =>
                new Promise((_ok, no) => {
                    signal.addEventListener('abort', () =>
                        no(Object.assign(new Error('abortado'), { name: 'AbortError' }))
                    );
                })
        );

        await expect(crear({ timeoutMs: 20 }).transcribir({ audio, mime: 'audio/webm' })).rejects.toMatchObject({
            codigo: 'timeout'
        });
    });

    it('un fallo de red es "proveedor"', async () => {
        fetchImpl.mockRejectedValue(new TypeError('fetch failed'));

        await expect(crear().transcribir({ audio, mime: 'audio/webm' })).rejects.toMatchObject({
            codigo: 'proveedor'
        });
    });

    describe('crearTranscriptor', () => {
        it('toma clave y modelo del entorno, con whisper-large-v3-turbo por defecto', () => {
            const porDefecto = crearTranscriptor({ GROQ_API_KEY: ' k ' });
            const propio = crearTranscriptor({ GROQ_API_KEY: 'k', GROQ_STT_MODEL: 'whisper-large-v3' });

            expect(porDefecto.apiKey).toBe('k');
            expect(porDefecto.model).toBe('whisper-large-v3-turbo');
            expect(propio.model).toBe('whisper-large-v3');
        });
    });
});
