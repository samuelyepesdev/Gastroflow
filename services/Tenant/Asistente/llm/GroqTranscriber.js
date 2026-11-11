const { LlmError } = require('./errores');

const URL_TRANSCRIPCION = 'https://api.groq.com/openai/v1/audio/transcriptions';
const TIMEOUT_DEFECTO_MS = 20000;
const IDIOMA = 'es';

const MSG_NO_DISPONIBLE = 'El servicio de transcripción no está disponible en este momento.';

// Groq detecta el formato por la extensión del archivo: se deduce del tipo de contenido que grabó el navegador.
const EXTENSIONES = {
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/mp4': 'mp4',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/flac': 'flac',
    'audio/x-m4a': 'm4a',
    'audio/m4a': 'm4a'
};

function extensionDe(mime) {
    const base = String(mime || '')
        .split(';')[0]
        .trim()
        .toLowerCase();
    return EXTENSIONES[base] || 'webm';
}

function segundosDe(cabecera) {
    const n = Number.parseInt(cabecera, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Transcribe audio a texto con Whisper en Groq. La clave vive solo en el servidor y no se registra;
 * los errores se traducen a LlmError sin copiar el cuerpo del proveedor. El audio se procesa en
 * memoria: no se escribe a disco.
 */
class GroqTranscriber {
    constructor({ apiKey, model, timeoutMs = TIMEOUT_DEFECTO_MS, fetchImpl = globalThis.fetch }) {
        this.apiKey = apiKey;
        this.model = model;
        this.timeoutMs = timeoutMs;
        this.fetchImpl = fetchImpl;
    }

    _formulario(audio, mime) {
        const form = new FormData();
        form.append('file', new Blob([audio], { type: mime }), `dictado.${extensionDe(mime)}`);
        form.append('model', this.model);
        form.append('language', IDIOMA);
        form.append('response_format', 'json');
        form.append('temperature', '0');
        return form;
    }

    /**
     * @param {{audio: Buffer, mime: string}} entrada
     * @returns {Promise<string>} texto transcrito ('' si no se entendió nada)
     */
    async transcribir({ audio, mime }) {
        if (!this.apiKey) {
            throw new LlmError('no_configurado', 'El asistente no está configurado.');
        }
        const controlador = new AbortController();
        const temporizador = setTimeout(() => controlador.abort(), this.timeoutMs);
        try {
            const res = await this.fetchImpl(URL_TRANSCRIPCION, {
                method: 'POST',
                // Sin Content-Type: fetch lo fija con el boundary del multipart.
                headers: { Authorization: `Bearer ${this.apiKey}` },
                body: this._formulario(audio, mime),
                signal: controlador.signal
            });
            if (res.status === 429) {
                throw new LlmError('limite', 'El servicio de voz está recibiendo demasiadas peticiones.', {
                    reintentarEnSegundos: segundosDe(res.headers.get('retry-after'))
                });
            }
            if (!res.ok) {
                // eslint-disable-next-line no-console
                console.error(`[asistente] Groq (transcripción) respondió HTTP ${res.status}`);
                throw new LlmError('proveedor', MSG_NO_DISPONIBLE);
            }
            const datos = await res.json().catch(() => null);
            if (!datos || typeof datos.text !== 'string') {
                throw new LlmError('respuesta_invalida', 'No entendí la respuesta del servicio de voz.');
            }
            return datos.text.trim();
        } catch (e) {
            if (e instanceof LlmError) {
                throw e;
            }
            if (e?.name === 'AbortError' || controlador.signal.aborted) {
                throw new LlmError('timeout', 'El servicio de voz tardó demasiado en responder.');
            }
            // eslint-disable-next-line no-console
            console.error('[asistente] fallo de red con Groq (transcripción):', e?.name);
            throw new LlmError('proveedor', MSG_NO_DISPONIBLE);
        } finally {
            clearTimeout(temporizador);
        }
    }
}

module.exports = GroqTranscriber;
