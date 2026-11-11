/**
 * Texto escrito por terceros (nombres de restaurantes, mensajes de error) que llegará al modelo del
 * superadmin: sin caracteres de control, con los espacios juntos y con largo acotado. No elimina un
 * intento de engaño con palabras normales: por eso el modelo solo tiene herramientas de lectura y el
 * prompt le dice que los resultados son datos, no instrucciones.
 */
function textoSeguro(valor, max = 80) {
    if (typeof valor !== 'string') {
        return '';
    }
    return (
        valor
            // eslint-disable-next-line no-control-regex
            .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, max)
            .trim()
    );
}

const num = valor => Number(valor) || 0;

module.exports = { textoSeguro, num };
