const GroqProvider = require('./GroqProvider');
const GroqTranscriber = require('./GroqTranscriber');
const GroqVision = require('./GroqVision');

// Modelo por defecto: el de los ejemplos de la documentación de Groq. Los modelos cambian y se retiran con
// frecuencia: confirmar en console.groq.com/docs/models y fijarlo con GROQ_MODEL en el entorno.
const MODELO_DEFECTO = 'llama-3.3-70b-versatile';

/** ¿Hay una clave de Groq configurada en el entorno? Sin ella el asistente queda deshabilitado. */
function asistenteConfigurado(env = process.env) {
    return typeof env.GROQ_API_KEY === 'string' && env.GROQ_API_KEY.trim() !== '';
}

/**
 * Crea el proveedor a partir del entorno: GROQ_API_KEY, GROQ_MODEL (opcional) y GROQ_TIMEOUT_MS (opcional).
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{fetchImpl?: Function}} [opciones] - solo para tests.
 */
function crearProveedor(env = process.env, { fetchImpl } = {}) {
    const timeoutMs = Number.parseInt(env.GROQ_TIMEOUT_MS, 10);
    return new GroqProvider({
        apiKey: (env.GROQ_API_KEY || '').trim(),
        model: (env.GROQ_MODEL || '').trim() || MODELO_DEFECTO,
        timeoutMs: timeoutMs > 0 ? timeoutMs : undefined,
        fetchImpl
    });
}

// Whisper para dictar. Confirmar el modelo vigente en console.groq.com/docs/models; se fija con GROQ_STT_MODEL.
const MODELO_TRANSCRIPCION_DEFECTO = 'whisper-large-v3-turbo';

/** Transcriptor de voz a partir del entorno: GROQ_API_KEY, GROQ_STT_MODEL y GROQ_TIMEOUT_MS (opcionales). */
function crearTranscriptor(env = process.env, { fetchImpl } = {}) {
    const timeoutMs = Number.parseInt(env.GROQ_TIMEOUT_MS, 10);
    return new GroqTranscriber({
        apiKey: (env.GROQ_API_KEY || '').trim(),
        model: (env.GROQ_STT_MODEL || '').trim() || MODELO_TRANSCRIPCION_DEFECTO,
        timeoutMs: timeoutMs > 0 ? timeoutMs : undefined,
        fetchImpl
    });
}

// Modelo de visión para leer cartas desde una foto. Los modelos de visión de Groq están en vista previa y pueden
// retirarse con poco aviso: confirmar en console.groq.com/docs/vision y fijarlo con GROQ_VISION_MODEL.
const MODELO_VISION_DEFECTO = 'qwen/qwen3.8-27b';

/** Lector de imágenes a partir del entorno: GROQ_API_KEY, GROQ_VISION_MODEL y GROQ_VISION_TIMEOUT_MS (opcionales). */
function crearLectorImagenes(env = process.env, { fetchImpl } = {}) {
    const timeoutMs = Number.parseInt(env.GROQ_VISION_TIMEOUT_MS, 10);
    return new GroqVision({
        apiKey: (env.GROQ_API_KEY || '').trim(),
        model: (env.GROQ_VISION_MODEL || '').trim() || MODELO_VISION_DEFECTO,
        timeoutMs: timeoutMs > 0 ? timeoutMs : undefined,
        fetchImpl
    });
}

module.exports = {
    crearProveedor,
    crearTranscriptor,
    crearLectorImagenes,
    asistenteConfigurado,
    MODELO_DEFECTO,
    MODELO_VISION_DEFECTO
};
