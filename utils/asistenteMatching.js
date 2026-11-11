/**
 * Resolución de texto dictado ("mesa cuatro", "burritos de la casa") a mesas y productos reales.
 *
 * Es lógica pura y determinista: el modelo de lenguaje solo entrega texto crudo y es el backend quien
 * decide a qué fila corresponde. Si no hay una única respuesta clara, se devuelve `ambigua` o
 * `sin_coincidencia` y el asistente pregunta; nunca se adivina.
 *
 * Las piezas viven en ./asistente (normalizacion, mesas, productos). Este archivo es su entrada pública.
 */
const { normalizar, palabrasANumeros } = require('./asistente/normalizacion');
const { resolverMesa } = require('./asistente/mesas');
const { resolverProducto } = require('./asistente/productos');

module.exports = { normalizar, palabrasANumeros, resolverMesa, resolverProducto };
