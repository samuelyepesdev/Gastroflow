const { LlmError } = require('./llm/errores');

/** Piezas comunes de las respuestas del orquestador: metadatos de auditoría y errores con mensaje seguro. */

const nuevaMeta = () => ({ herramientas: [], uso: null });

const error = (texto, meta, codigo = 'solicitud') => ({ tipo: 'error', codigo, texto, meta });

/** Suma el consumo de tokens de cada vuelta al modelo. */
function sumarUso(meta, uso) {
    if (!uso) {
        return;
    }
    const actual = meta.uso || { entrada: 0, salida: 0, total: 0 };
    meta.uso = {
        entrada: actual.entrada + (uso.entrada || 0),
        salida: actual.salida + (uso.salida || 0),
        total: actual.total + (uso.total || 0)
    };
}

/** Errores del proveedor y cualquier otro, siempre con un mensaje que se puede mostrar. */
function desdeError(e, meta) {
    if (e instanceof LlmError) {
        const espera =
            e.reintentarEnSegundos !== null && e.reintentarEnSegundos !== undefined
                ? `en ${e.reintentarEnSegundos} segundos`
                : 'en un momento';
        const texto =
            e.codigo === 'limite' ? `Estoy recibiendo muchas peticiones. Inténtalo de nuevo ${espera}.` : e.message;
        return error(texto, meta, e.codigo);
    }
    // eslint-disable-next-line no-console
    console.error('[asistente] error inesperado:', e?.name, e?.message);
    return error('No pude procesar tu comando. Inténtalo de nuevo.', meta, 'interno');
}

module.exports = { nuevaMeta, error, sumarUso, desdeError };
