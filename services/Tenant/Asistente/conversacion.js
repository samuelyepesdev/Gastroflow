const { limpiar } = require('./tools/validacion');

const MAX_TURNOS_HISTORIAL = 6;
const MAX_LARGO_TURNO = 500;
const MAX_LARGO_RESULTADO = 6000;
const LARGO_EXTRACTO = 4000;

/**
 * El historial lo manda el cliente, así que NO es confiable: solo se aceptan turnos de texto de usuario o
 * asistente (nunca system, tool ni tool_calls), recortados y limitados a los últimos turnos.
 */
function limpiarHistorial(historial) {
    if (!Array.isArray(historial)) {
        return [];
    }
    return historial
        .filter(m => m && typeof m === 'object' && (m.role === 'user' || m.role === 'assistant'))
        .map(m => ({ role: m.role, content: typeof m.content === 'string' ? limpiar(m.content, MAX_LARGO_TURNO) : '' }))
        .filter(m => m.content !== '')
        .slice(-MAX_TURNOS_HISTORIAL);
}

/** Mensaje del asistente que pidió herramientas, en el formato que el proveedor espera de vuelta. */
function mensajeAsistente(texto, llamadas) {
    return {
        role: 'assistant',
        content: texto ?? null,
        tool_calls: llamadas.map(l => ({
            id: l.id,
            type: 'function',
            function: { name: l.nombre, arguments: JSON.stringify(l.argumentos ?? {}) }
        }))
    };
}

/** Resultado de una herramienta devuelto al modelo: dato acotado, nunca instrucción. */
function mensajeHerramienta(idLlamada, resultado) {
    const cuerpo = { tipo: resultado.tipo };
    if (resultado.datos !== undefined) {
        cuerpo.datos = resultado.datos;
    }
    if (resultado.mensaje !== undefined) {
        cuerpo.mensaje = resultado.mensaje;
    }
    let content = JSON.stringify(cuerpo);
    if (content.length > MAX_LARGO_RESULTADO) {
        content = JSON.stringify({ tipo: resultado.tipo, truncado: true, extracto: content.slice(0, LARGO_EXTRACTO) });
    }
    return { role: 'tool', tool_call_id: idLlamada, content };
}

module.exports = { limpiarHistorial, mensajeAsistente, mensajeHerramienta };
