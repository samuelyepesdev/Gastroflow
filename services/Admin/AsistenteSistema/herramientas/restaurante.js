const Repo = require('../../../../repositories/Admin/AsistenteSistemaRepository');
const { ToolError, AclaracionError } = require('../../../Tenant/Asistente/tools/errores');
const { textoSeguro } = require('../seguro');

const MIN_NOMBRE = 2;
const MAX_NOMBRE = 60;
const MAX_CANDIDATOS = 5;

/**
 * El restaurante que el superadmin nombró, o pregunta cuál si hay varios. Un nombre idéntico gana sobre
 * coincidencias parciales. El modelo solo manda el texto: el id sale de la base de datos.
 * @returns {Promise<{id:number, nombre:string}>}
 */
async function resolverRestaurante(nombre) {
    const texto = typeof nombre === 'string' ? nombre.trim() : '';
    if (texto.length < MIN_NOMBRE || texto.length > MAX_NOMBRE) {
        throw new AclaracionError(`Dime el nombre del restaurante (entre ${MIN_NOMBRE} y ${MAX_NOMBRE} letras).`);
    }
    const filas = await Repo.buscarRestaurantes(texto, MAX_CANDIDATOS);
    if (filas.length === 0) {
        throw new ToolError(`No encontré restaurantes que coincidan con "${textoSeguro(texto)}".`);
    }
    const exacto = filas.find(f => String(f.nombre).trim().toLowerCase() === texto.toLowerCase());
    const elegido = exacto || (filas.length === 1 ? filas[0] : null);
    if (!elegido) {
        const nombres = filas.map(f => textoSeguro(f.nombre)).join(', ');
        throw new AclaracionError(`Hay varios restaurantes que coinciden: ${nombres}. ¿Cuál es?`);
    }
    return { id: elegido.id, nombre: textoSeguro(elegido.nombre) };
}

module.exports = { resolverRestaurante };
