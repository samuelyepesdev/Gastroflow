const GroqProvider = require('../../../services/Tenant/Asistente/llm/GroqProvider');
const { LlmError } = require('../../../services/Tenant/Asistente/llm/errores');
const { crearProveedor, asistenteConfigurado } = require('../../../services/Tenant/Asistente/llm');

const KEY = 'gsk_clave_super_secreta_123';

function respuesta({ status = 200, cuerpo = {}, headers = {} } = {}) {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: nombre => headers[nombre.toLowerCase()] ?? null },
        json: async () => cuerpo
    };
}

const textoOk = content => ({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }] });
const llamadaOk = (llamadas, content = null) => ({
    choices: [{ message: { role: 'assistant', content, tool_calls: llamadas }, finish_reason: 'tool_calls' }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
});

const definiciones = [
    {
        name: 'mesas_libres',
        description: 'Lista las mesas que están libres en este momento.',
        parameters: { type: 'object', properties: {} }
    }
];
const mensajes = [
    { role: 'system', content: 'Eres Chef.' },
    { role: 'user', content: 'qué mesas hay libres' }
];

const crear = (fetchImpl, extra = {}) => new GroqProvider({ apiKey: KEY, model: 'modelo-x', fetchImpl, ...extra });

describe('GroqProvider', () => {
    let errorSpy;
    beforeEach(() => {
        errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
        errorSpy.mockRestore();
    });

    it('envía la petición con el formato OpenAI-compatible de Groq y sin datos del tenant', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(respuesta({ cuerpo: textoOk('hola') }));

        await crear(fetchImpl).chat({ mensajes, herramientas: definiciones });

        const [url, opciones] = fetchImpl.mock.calls[0];
        expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
        expect(opciones.method).toBe('POST');
        expect(opciones.headers.Authorization).toBe(`Bearer ${KEY}`);
        expect(opciones.headers['Content-Type']).toBe('application/json');
        expect(opciones.signal).toBeDefined();

        const cuerpo = JSON.parse(opciones.body);
        expect(cuerpo.model).toBe('modelo-x');
        expect(cuerpo.messages).toEqual(mensajes);
        expect(cuerpo.tool_choice).toBe('auto');
        expect(cuerpo.stream).toBe(false);
        expect(cuerpo.temperature).toBeLessThanOrEqual(0.3);
        expect(cuerpo.max_tokens).toBeGreaterThan(0);
        expect(cuerpo.tools).toEqual([
            {
                type: 'function',
                function: {
                    name: 'mesas_libres',
                    description: 'Lista las mesas que están libres en este momento.',
                    parameters: { type: 'object', properties: {} }
                }
            }
        ]);
        expect(opciones.body).not.toMatch(/tenant/i);
    });

    it('sin herramientas no manda tools ni tool_choice', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(respuesta({ cuerpo: textoOk('hola') }));

        await crear(fetchImpl).chat({ mensajes, herramientas: [] });

        const cuerpo = JSON.parse(fetchImpl.mock.calls[0][1].body);
        expect(cuerpo.tools).toBeUndefined();
        expect(cuerpo.tool_choice).toBeUndefined();
    });

    it('devuelve el texto cuando el modelo responde sin herramientas', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(respuesta({ cuerpo: textoOk('Hay 3 mesas libres') }));

        const r = await crear(fetchImpl).chat({ mensajes, herramientas: definiciones });

        expect(r).toEqual({ texto: 'Hay 3 mesas libres', llamadas: [], uso: null });
    });

    it('normaliza las llamadas a herramientas y parsea sus argumentos', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(
            respuesta({
                cuerpo: llamadaOk([
                    {
                        id: 'call_1',
                        type: 'function',
                        function: {
                            name: 'agregar_items',
                            arguments: '{"mesa":"4","items":[{"producto":"ramen","cantidad":2}]}'
                        }
                    }
                ])
            })
        );

        const r = await crear(fetchImpl).chat({ mensajes, herramientas: definiciones });

        expect(r.texto).toBeNull();
        expect(r.llamadas).toEqual([
            {
                id: 'call_1',
                nombre: 'agregar_items',
                argumentos: { mesa: '4', items: [{ producto: 'ramen', cantidad: 2 }] }
            }
        ]);
        expect(r.uso).toEqual({ entrada: 10, salida: 5, total: 15 });
    });

    it('argumentos que no son JSON válido o no son un objeto llegan como null (nunca se ejecutan)', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(
            respuesta({
                cuerpo: llamadaOk([
                    { id: 'a', type: 'function', function: { name: 'mesas_libres', arguments: '{roto' } },
                    { id: 'b', type: 'function', function: { name: 'mesas_libres', arguments: '"texto"' } },
                    { id: 'c', type: 'function', function: { name: 'mesas_libres', arguments: '[1,2]' } },
                    { id: 'd', type: 'function', function: { name: 'mesas_libres', arguments: '' } }
                ])
            })
        );

        const r = await crear(fetchImpl).chat({ mensajes, herramientas: definiciones });

        expect(r.llamadas.map(l => l.argumentos)).toEqual([null, null, null, {}]);
    });

    it('limita la cantidad de llamadas por respuesta', async () => {
        const muchas = Array.from({ length: 12 }, (_, i) => ({
            id: `c${i}`,
            type: 'function',
            function: { name: 'mesas_libres', arguments: '{}' }
        }));
        const fetchImpl = jest.fn().mockResolvedValue(respuesta({ cuerpo: llamadaOk(muchas) }));

        const r = await crear(fetchImpl).chat({ mensajes, herramientas: definiciones });

        expect(r.llamadas).toHaveLength(5);
    });

    it('descarta llamadas sin nombre de función', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(
            respuesta({
                cuerpo: llamadaOk([
                    { id: 'x', type: 'function', function: {} },
                    { id: 'y', type: 'function', function: { name: 'mesas_libres', arguments: '{}' } }
                ])
            })
        );

        const r = await crear(fetchImpl).chat({ mensajes, herramientas: definiciones });

        expect(r.llamadas.map(l => l.id)).toEqual(['y']);
    });

    describe('errores', () => {
        it('sin clave configurada falla sin llamar a la red', async () => {
            const fetchImpl = jest.fn();
            const p = new GroqProvider({ apiKey: '', model: 'm', fetchImpl });

            await expect(p.chat({ mensajes, herramientas: [] })).rejects.toMatchObject({ codigo: 'no_configurado' });
            expect(fetchImpl).not.toHaveBeenCalled();
        });

        it('429 -> límite, con el tiempo de espera que informe el proveedor', async () => {
            const fetchImpl = jest.fn().mockResolvedValue(respuesta({ status: 429, headers: { 'retry-after': '12' } }));

            const promesa = crear(fetchImpl).chat({ mensajes, herramientas: [] });

            await expect(promesa).rejects.toMatchObject({ codigo: 'limite', reintentarEnSegundos: 12 });
        });

        it('429 sin retry-after -> límite sin tiempo', async () => {
            const fetchImpl = jest.fn().mockResolvedValue(respuesta({ status: 429 }));

            await expect(crear(fetchImpl).chat({ mensajes, herramientas: [] })).rejects.toMatchObject({
                codigo: 'limite',
                reintentarEnSegundos: null
            });
        });

        it.each([401, 403, 400, 500, 503])('HTTP %s -> proveedor, sin filtrar la clave ni el cuerpo', async status => {
            const fetchImpl = jest
                .fn()
                .mockResolvedValue(respuesta({ status, cuerpo: { error: { message: `Invalid API key ${KEY}` } } }));

            const err = await crear(fetchImpl)
                .chat({ mensajes, herramientas: [] })
                .catch(e => e);

            expect(err).toBeInstanceOf(LlmError);
            expect(err.codigo).toBe('proveedor');
            expect(err.message).not.toContain(KEY);
            expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(KEY);
        });

        it('error de red -> proveedor', async () => {
            const fetchImpl = jest.fn().mockRejectedValue(new Error('ECONNRESET'));

            await expect(crear(fetchImpl).chat({ mensajes, herramientas: [] })).rejects.toMatchObject({
                codigo: 'proveedor'
            });
        });

        it('si el proveedor tarda más del tiempo máximo -> timeout y se cancela la petición', async () => {
            let senal;
            const fetchImpl = jest.fn((_url, opciones) => {
                senal = opciones.signal;
                return new Promise((_resolve, reject) => {
                    opciones.signal.addEventListener('abort', () =>
                        reject(Object.assign(new Error('abort'), { name: 'AbortError' }))
                    );
                });
            });

            const promesa = crear(fetchImpl, { timeoutMs: 20 }).chat({ mensajes, herramientas: [] });

            await expect(promesa).rejects.toMatchObject({ codigo: 'timeout' });
            expect(senal.aborted).toBe(true);
        });

        it.each([
            ['sin choices', {}],
            ['choices vacío', { choices: [] }],
            ['sin message', { choices: [{}] }]
        ])('respuesta con forma inesperada (%s) -> respuesta_invalida', async (_n, cuerpo) => {
            const fetchImpl = jest.fn().mockResolvedValue(respuesta({ cuerpo }));

            await expect(crear(fetchImpl).chat({ mensajes, herramientas: [] })).rejects.toMatchObject({
                codigo: 'respuesta_invalida'
            });
        });

        it('cuerpo que no es JSON -> respuesta_invalida', async () => {
            const res = respuesta();
            res.json = async () => {
                throw new SyntaxError('Unexpected token <');
            };
            const fetchImpl = jest.fn().mockResolvedValue(res);

            await expect(crear(fetchImpl).chat({ mensajes, herramientas: [] })).rejects.toMatchObject({
                codigo: 'respuesta_invalida'
            });
        });
    });
});

describe('fábrica del proveedor', () => {
    it('asistenteConfigurado depende de GROQ_API_KEY', () => {
        expect(asistenteConfigurado({})).toBe(false);
        expect(asistenteConfigurado({ GROQ_API_KEY: '   ' })).toBe(false);
        expect(asistenteConfigurado({ GROQ_API_KEY: KEY })).toBe(true);
    });

    it('crearProveedor toma modelo y timeout del entorno, con valores por defecto sanos', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(respuesta({ cuerpo: textoOk('ok') }));

        const conEntorno = crearProveedor(
            { GROQ_API_KEY: KEY, GROQ_MODEL: 'otro-modelo', GROQ_TIMEOUT_MS: '5000' },
            { fetchImpl }
        );
        await conEntorno.chat({ mensajes, herramientas: [] });
        expect(JSON.parse(fetchImpl.mock.calls[0][1].body).model).toBe('otro-modelo');

        const porDefecto = crearProveedor({ GROQ_API_KEY: KEY, GROQ_TIMEOUT_MS: 'abc' }, { fetchImpl });
        await porDefecto.chat({ mensajes, herramientas: [] });
        const modelo = JSON.parse(fetchImpl.mock.calls[1][1].body).model;
        expect(typeof modelo).toBe('string');
        expect(modelo.length).toBeGreaterThan(0);
    });

    it('crearProveedor sin clave devuelve un proveedor que falla con no_configurado', async () => {
        const proveedor = crearProveedor({});
        await expect(proveedor.chat({ mensajes, herramientas: [] })).rejects.toMatchObject({
            codigo: 'no_configurado'
        });
    });
});
