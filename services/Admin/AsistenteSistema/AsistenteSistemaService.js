const AsistenteSistemaTools = require('./AsistenteSistemaTools');
const { construirSistema } = require('./prompt');
const { crearProveedor } = require('../../Tenant/Asistente/llm');
const { limpiarHistorial, mensajeAsistente, mensajeHerramienta } = require('../../Tenant/Asistente/conversacion');
const { nuevaMeta, error, sumarUso, desdeError } = require('../../Tenant/Asistente/respuestas');

const MAX_TEXTO = 500;
const MAX_ITERACIONES = 4;
const MAX_RESPUESTA = 800;

const sesionValida = ctx => !!ctx && Number.isInteger(ctx.userId) && ctx.userId > 0;

/**
 * Pide al modelo las herramientas que necesite y devuelve sus resultados como mensajes `tool`.
 * Todas son de lectura: no hay confirmaciones ni escrituras.
 */
async function procesarLlamadas(llamadas, mensajes, meta) {
    for (const l of llamadas) {
        const res =
            l.argumentos === null
                ? { tipo: 'error', mensaje: 'Argumentos inválidos.' }
                : await AsistenteSistemaTools.preparar(l.nombre, l.argumentos);
        meta.herramientas.push({ nombre: l.nombre, resultado: res.tipo });
        mensajes.push(mensajeHerramienta(l.id, res));
    }
}

/**
 * Asistente del superadmin para consultar la plataforma. Reutiliza el proveedor de IA, el saneo del historial
 * y el recorte de resultados del asistente de los restaurantes, pero con herramientas propias y SOLO de lectura.
 *
 * Respuesta: { tipo: 'respuesta'|'error', texto, codigo?, meta: { herramientas, uso } }.
 */
class AsistenteSistemaService {
    /**
     * @param {{userId:number}} ctx - el superadmin de la sesión
     * @param {{texto:string, historial?:Array}} entrada
     */
    static async comando(ctx, { texto, historial } = {}) {
        const meta = nuevaMeta();
        if (!sesionValida(ctx)) {
            return error('Tu sesión no es válida.', meta, 'sesion');
        }
        const pedido = typeof texto === 'string' ? texto.trim() : '';
        if (!pedido || pedido.length > MAX_TEXTO) {
            return error(`Dime qué necesitas, en menos de ${MAX_TEXTO} caracteres.`, meta);
        }

        try {
            const herramientas = AsistenteSistemaTools.definiciones();
            const mensajes = [
                { role: 'system', content: construirSistema() },
                ...limpiarHistorial(historial),
                { role: 'user', content: pedido }
            ];
            const proveedor = crearProveedor();

            for (let i = 0; i < MAX_ITERACIONES; i++) {
                const r = await proveedor.chat({ mensajes, herramientas });
                sumarUso(meta, r.uso);
                if (r.llamadas.length === 0) {
                    const respuesta = (r.texto || 'No tengo una respuesta para eso.').slice(0, MAX_RESPUESTA);
                    return { tipo: 'respuesta', texto: respuesta, meta };
                }
                mensajes.push(mensajeAsistente(r.texto, r.llamadas));
                await procesarLlamadas(r.llamadas, mensajes, meta);
            }
            return error('No pude completar eso. Intenta decirlo de otra forma.', meta, 'iteraciones');
        } catch (e) {
            return desdeError(e, meta);
        }
    }
}

module.exports = AsistenteSistemaService;
