const { LlmError } = require('./errores');

const URL_CHAT = 'https://api.groq.com/openai/v1/chat/completions';
const TIMEOUT_DEFECTO_MS = 90000; // leer una carta larga con un modelo de visión tarda bastante más que un chat
const MAX_TOKENS = 8000;
const MSG_NO_DISPONIBLE = 'El servicio de lectura de imágenes no está disponible en este momento.';

const MIMES_VALIDOS = new Set(['image/jpeg', 'image/png', 'image/webp']);

function segundosDe(cabecera) {
    const n = Number.parseInt(cabecera, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Lee una imagen con un modelo de visión de Groq y devuelve el texto que respondió.
 * La clave vive solo en el servidor y no se registra; los errores se traducen a LlmError sin copiar el cuerpo
 * del proveedor. La imagen se procesa en memoria (viaja como data URL): no se escribe a disco ni se guarda.
 */
class GroqVision {
    constructor({ apiKey, model, timeoutMs = TIMEOUT_DEFECTO_MS, fetchImpl = globalThis.fetch }) {
        this.apiKey = apiKey;
        this.model = model;
        this.timeoutMs = timeoutMs;
        this.fetchImpl = fetchImpl;
    }

    _cuerpo({ imagen, mime, sistema, instruccion }) {
        return {
            model: this.model,
            messages: [
                { role: 'system', content: sistema },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: instruccion },
                        { type: 'image_url', image_url: { url: `data:${mime};base64,${imagen.toString('base64')}` } }
                    ]
                }
            ],
            temperature: 0,
            max_tokens: MAX_TOKENS,
            stream: false,
            response_format: { type: 'json_object' }
        };
    }

    /**
     * @param {{imagen: Buffer, mime: string, sistema: string, instruccion: string}} entrada
     * @returns {Promise<string>} texto de la respuesta del modelo (se espera JSON)
     */
    async leer(entrada) {
        if (!this.apiKey) {
            throw new LlmError('no_configurado', 'La lectura de cartas no está configurada.');
        }
        if (!Buffer.isBuffer(entrada.imagen) || entrada.imagen.length === 0 || !MIMES_VALIDOS.has(entrada.mime)) {
            throw new LlmError('respuesta_invalida', 'La imagen no es válida.');
        }

        const controlador = new AbortController();
        const temporizador = setTimeout(() => controlador.abort(), this.timeoutMs);
        try {
            const res = await this.fetchImpl(URL_CHAT, {
                method: 'POST',
                headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(this._cuerpo(entrada)),
                signal: controlador.signal
            });
            if (res.status === 429) {
                throw new LlmError('limite', 'El servicio de IA está recibiendo demasiadas peticiones.', {
                    reintentarEnSegundos: segundosDe(res.headers.get('retry-after'))
                });
            }
            if (!res.ok) {
                // eslint-disable-next-line no-console
                console.error(`[carta-foto] Groq respondió HTTP ${res.status} (modelo ${this.model})`);
                throw new LlmError('proveedor', MSG_NO_DISPONIBLE);
            }
            let datos;
            try {
                datos = await res.json();
            } catch {
                throw new LlmError('respuesta_invalida', 'No entendí la respuesta del servicio de IA.');
            }
            const texto = datos?.choices?.[0]?.message?.content;
            if (typeof texto !== 'string' || texto.trim() === '') {
                throw new LlmError('respuesta_invalida', 'No entendí la respuesta del servicio de IA.');
            }
            return texto;
        } catch (e) {
            if (e instanceof LlmError) {
                throw e;
            }
            if (e?.name === 'AbortError' || controlador.signal.aborted) {
                throw new LlmError('timeout', 'El servicio de IA tardó demasiado en leer la imagen.');
            }
            // eslint-disable-next-line no-console
            console.error('[carta-foto] fallo de red con Groq:', e?.name);
            throw new LlmError('proveedor', MSG_NO_DISPONIBLE);
        } finally {
            clearTimeout(temporizador);
        }
    }
}

module.exports = GroqVision;
module.exports.MIMES_VALIDOS = MIMES_VALIDOS;
