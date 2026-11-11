const LlmProvider = require('./LlmProvider');
const { LlmError } = require('./errores');

const URL_CHAT = 'https://api.groq.com/openai/v1/chat/completions';
const TIMEOUT_DEFECTO_MS = 15000;
const TEMPERATURA = 0.1; // casi determinista: es un asistente de pedidos, no un escritor
const MAX_TOKENS = 500;
const MAX_LLAMADAS = 5;

const MSG_NO_DISPONIBLE = 'El servicio de IA no está disponible en este momento.';

/** Definiciones de AsistenteToolsService -> formato `tools` de la API. */
function aHerramientasApi(herramientas) {
    return herramientas.map(h => ({
        type: 'function',
        function: { name: h.name, description: h.description, parameters: h.parameters }
    }));
}

/** `function.arguments` llega como texto JSON: solo un objeto es válido; cualquier otra cosa -> null. */
function parsearArgumentos(crudo) {
    if (crudo === undefined || crudo === null || crudo === '') {
        return {};
    }
    if (typeof crudo === 'object') {
        return Array.isArray(crudo) ? null : crudo;
    }
    try {
        const valor = JSON.parse(crudo);
        return valor !== null && typeof valor === 'object' && !Array.isArray(valor) ? valor : null;
    } catch {
        return null;
    }
}

function normalizarLlamadas(toolCalls) {
    if (!Array.isArray(toolCalls)) {
        return [];
    }
    return toolCalls
        .filter(c => c && typeof c.function?.name === 'string' && c.function.name !== '')
        .slice(0, MAX_LLAMADAS)
        .map(c => ({
            id: String(c.id ?? ''),
            nombre: c.function.name,
            argumentos: parsearArgumentos(c.function.arguments)
        }));
}

function normalizarUso(uso) {
    if (!uso) {
        return null;
    }
    return { entrada: uso.prompt_tokens, salida: uso.completion_tokens, total: uso.total_tokens };
}

function segundosDe(cabecera) {
    const n = Number.parseInt(cabecera, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Proveedor Groq (API compatible con OpenAI). La clave vive solo en el servidor y no se registra en logs;
 * los errores del proveedor se traducen a LlmError sin copiar su cuerpo.
 */
class GroqProvider extends LlmProvider {
    constructor({ apiKey, model, timeoutMs = TIMEOUT_DEFECTO_MS, fetchImpl = globalThis.fetch }) {
        super();
        this.apiKey = apiKey;
        this.model = model;
        this.timeoutMs = timeoutMs;
        this.fetchImpl = fetchImpl;
    }

    _cuerpo(mensajes, herramientas) {
        const cuerpo = {
            model: this.model,
            messages: mensajes,
            temperature: TEMPERATURA,
            max_tokens: MAX_TOKENS,
            stream: false
        };
        if (herramientas.length > 0) {
            cuerpo.tools = aHerramientasApi(herramientas);
            cuerpo.tool_choice = 'auto';
        }
        return cuerpo;
    }

    /** Hace la petición y lee el JSON, todo bajo el mismo límite de tiempo. */
    async _enviar(cuerpo) {
        const controlador = new AbortController();
        const temporizador = setTimeout(() => controlador.abort(), this.timeoutMs);
        let res;
        try {
            res = await this.fetchImpl(URL_CHAT, {
                method: 'POST',
                headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(cuerpo),
                signal: controlador.signal
            });
            if (res.status === 429) {
                throw new LlmError('limite', 'El asistente está recibiendo demasiadas peticiones.', {
                    reintentarEnSegundos: segundosDe(res.headers.get('retry-after'))
                });
            }
            if (!res.ok) {
                // eslint-disable-next-line no-console
                console.error(`[asistente] Groq respondió HTTP ${res.status}`);
                throw new LlmError('proveedor', MSG_NO_DISPONIBLE);
            }
            try {
                return await res.json();
            } catch {
                throw new LlmError('respuesta_invalida', 'No entendí la respuesta del servicio de IA.');
            }
        } catch (e) {
            if (e instanceof LlmError) {
                throw e;
            }
            if (e?.name === 'AbortError' || controlador.signal.aborted) {
                throw new LlmError('timeout', 'El servicio de IA tardó demasiado en responder.');
            }
            // eslint-disable-next-line no-console
            console.error('[asistente] fallo de red con Groq:', e?.name);
            throw new LlmError('proveedor', MSG_NO_DISPONIBLE);
        } finally {
            clearTimeout(temporizador);
        }
    }

    async chat({ mensajes, herramientas = [] }) {
        if (!this.apiKey) {
            throw new LlmError('no_configurado', 'El asistente no está configurado.');
        }
        const datos = await this._enviar(this._cuerpo(mensajes, herramientas));
        const mensaje = datos?.choices?.[0]?.message;
        if (!mensaje || typeof mensaje !== 'object') {
            throw new LlmError('respuesta_invalida', 'No entendí la respuesta del servicio de IA.');
        }
        const texto = typeof mensaje.content === 'string' && mensaje.content.trim() !== '' ? mensaje.content : null;
        return { texto, llamadas: normalizarLlamadas(mensaje.tool_calls), uso: normalizarUso(datos.usage) };
    }
}

module.exports = GroqProvider;
