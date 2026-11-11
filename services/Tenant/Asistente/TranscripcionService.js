const { crearTranscriptor } = require('./llm');
const { nuevaMeta, error, desdeError } = require('./respuestas');

const MIN_BYTES = 500; // por debajo no hay ni medio segundo de voz
const PREFIJO_TIPOS = [
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
    'audio/mpeg',
    'audio/wav',
    'audio/x-wav',
    'audio/flac',
    'audio/x-m4a',
    'audio/m4a'
];

const tipoBase = tipo =>
    String(tipo || '')
        .split(';')[0]
        .trim()
        .toLowerCase();

/**
 * Voz -> texto para el asistente. Solo transcribe: el texto vuelve al cliente, que lo envía como un
 * comando normal (con todos sus controles). El audio vive en memoria durante la petición y no se
 * guarda ni se registra.
 *
 * Respuesta: { tipo: 'transcripcion', texto, meta } o { tipo: 'error', codigo, texto, meta }.
 */
class TranscripcionService {
    /** @param {{audio: Buffer, tipo: string}} entrada - tipo = Content-Type que declaró el navegador */
    static async transcribir(entrada) {
        const meta = nuevaMeta();
        const { audio, tipo } = entrada || {};
        if (!PREFIJO_TIPOS.includes(tipoBase(tipo))) {
            return error('Ese formato de audio no se admite.', meta, 'formato');
        }
        if (!Buffer.isBuffer(audio) || audio.length < MIN_BYTES) {
            return error('No recibí audio. Mantén pulsado el micrófono y habla de nuevo.', meta, 'solicitud');
        }
        meta.bytes = audio.length;
        try {
            const texto = await crearTranscriptor().transcribir({ audio, mime: tipo });
            return { tipo: 'transcripcion', texto, meta };
        } catch (e) {
            return desdeError(e, meta);
        }
    }
}

module.exports = TranscripcionService;
