/** Error esperado, con un mensaje que se le puede mostrar al usuario. */
class ToolError extends Error {}

/** Falta información: el asistente debe preguntar al usuario. */
class AclaracionError extends Error {}

/** Los errores de negocio (Error plano) se muestran. Los técnicos (BD, TypeError...) no. */
function mensajeDe(e) {
    if (e instanceof ToolError || e instanceof AclaracionError) {
        return e.message;
    }
    if (e && e.constructor === Error && !e.code && !e.sqlMessage && !e.errno) {
        return e.message;
    }
    // eslint-disable-next-line no-console
    console.error('[asistente] error interno en herramienta:', e && (e.code || e.name), e && e.message);
    return 'No pude completar la acción por un problema interno. Inténtalo de nuevo.';
}

module.exports = { ToolError, AclaracionError, mensajeDe };
