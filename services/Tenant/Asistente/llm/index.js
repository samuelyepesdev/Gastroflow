const GroqProvider = require('./GroqProvider');

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

module.exports = { crearProveedor, asistenteConfigurado, MODELO_DEFECTO };
