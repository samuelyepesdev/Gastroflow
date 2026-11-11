/**
 * Error del proveedor de IA. `codigo` permite decidir qué decirle al usuario sin mirar el mensaje:
 *   no_configurado | limite | timeout | proveedor | respuesta_invalida
 * El mensaje es siempre seguro para mostrar: nunca incluye claves ni el cuerpo que devolvió el proveedor.
 */
class LlmError extends Error {
    constructor(codigo, mensaje, { reintentarEnSegundos = null } = {}) {
        super(mensaje);
        this.name = 'LlmError';
        this.codigo = codigo;
        this.reintentarEnSegundos = reintentarEnSegundos;
    }
}

module.exports = { LlmError };
