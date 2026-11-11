const AsistenteToolsService = require('./AsistenteToolsService');
const AsistenteRepository = require('../../../repositories/Tenant/AsistenteRepository');
const ConfirmacionStore = require('./ConfirmacionStore');
const { crearProveedor } = require('./llm');
const { nuevaMeta, error, sumarUso, desdeError } = require('./respuestas');
const { sanitizarNombre, construirSistema } = require('./prompt');
const { limpiarHistorial, mensajeAsistente, mensajeHerramienta } = require('./conversacion');

/**
 * Orquestador del asistente: lleva la conversación entre el usuario, el modelo y las herramientas.
 *
 * Garantías (ver odd/tasks/asistente-chef-fase1.md):
 *  - El modelo solo recibe mensajes y definiciones de herramientas: nunca tenant, usuario ni permisos.
 *  - Las escrituras NO se ejecutan al pedirlas: se guardan en el servidor y se piden confirmar (S5).
 *  - Lo que vuelve al modelo desde las herramientas se trata como dato y se acota (S7).
 *
 * Respuesta: { tipo: 'respuesta'|'confirmacion'|'error', texto, confirmationId?, expiraEnSegundos?, codigo?,
 *              meta: { herramientas: [{nombre, resultado}], uso } }. `meta` es para auditoría (T6).
 */

const MAX_TEXTO = 500;
const MAX_ITERACIONES = 4;
const MAX_RESPUESTA = 800;

function sesionValida(ctx) {
    return (
        !!ctx && Number.isInteger(ctx.tenantId) && ctx.tenantId > 0 && Number.isInteger(ctx.userId) && ctx.userId > 0
    );
}

/**
 * Prepara las llamadas que pidió el modelo. Una escritura corta el ciclo: se guarda y se pide confirmar.
 * @returns {Promise<Object|null>} la respuesta de confirmación, o null si todas fueron lecturas/errores
 */
async function procesarLlamadas(ctx, llamadas, mensajes, meta) {
    for (let i = 0; i < llamadas.length; i++) {
        const l = llamadas[i];
        const res =
            l.argumentos === null
                ? { tipo: 'error', mensaje: 'Argumentos inválidos.' }
                : await AsistenteToolsService.preparar(ctx, l.nombre, l.argumentos);
        meta.herramientas.push({ nombre: l.nombre, resultado: res.tipo });

        if (res.tipo === 'confirmacion') {
            const confirmationId = ConfirmacionStore.crear({
                tenantId: ctx.tenantId,
                userId: ctx.userId,
                accion: res.accion,
                resumen: res.resumen
            });
            const aviso =
                llamadas.length > i + 1 ? ' Hay otras acciones en tu pedido: indícamelas después de confirmar.' : '';
            return {
                tipo: 'confirmacion',
                texto: `${res.resumen} ¿Confirmo?${aviso}`,
                confirmationId,
                expiraEnSegundos: ConfirmacionStore.TTL_SEGUNDOS,
                meta
            };
        }
        mensajes.push(mensajeHerramienta(l.id, res));
    }
    return null;
}

class AsistenteService {
    /**
     * @param {{tenantId:number, userId:number, permisos:string[], allowedByPlan:Object}} ctx - de la sesión autenticada
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
            const herramientas = AsistenteToolsService.definiciones(ctx);
            if (herramientas.length === 0) {
                return error('No tienes acciones disponibles con el asistente.', meta, 'permisos');
            }
            const nombre = sanitizarNombre(await AsistenteRepository.nombreAsistente(ctx.tenantId));
            const mensajes = [
                { role: 'system', content: construirSistema(nombre) },
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
                const propuesta = await procesarLlamadas(ctx, r.llamadas, mensajes, meta);
                if (propuesta) {
                    return propuesta;
                }
            }
            return error('No pude completar eso. Intenta decirlo de otra forma.', meta, 'iteraciones');
        } catch (e) {
            return desdeError(e, meta);
        }
    }

    /**
     * Ejecuta (o descarta) la acción pendiente. La acción sale del servidor, nunca del cliente.
     * @param {{confirmationId:string, aceptar:boolean}} entrada - solo `aceptar === true` ejecuta.
     */
    static async confirmar(ctx, { confirmationId, aceptar } = {}) {
        const meta = nuevaMeta();
        if (!sesionValida(ctx)) {
            return error('Tu sesión no es válida.', meta, 'sesion');
        }
        const pendiente = ConfirmacionStore.consumir({
            tenantId: ctx.tenantId,
            userId: ctx.userId,
            id: confirmationId
        });
        if (!pendiente) {
            return error('Esa confirmación venció o ya se usó. Dímelo de nuevo.', meta, 'confirmacion_invalida');
        }
        if (aceptar !== true) {
            return { tipo: 'respuesta', texto: 'Listo, cancelé la acción.', meta };
        }

        try {
            const r = await AsistenteToolsService.ejecutar(ctx, pendiente.accion);
            meta.herramientas.push({ nombre: pendiente.accion.tool, resultado: r.tipo });
            if (r.tipo === 'resultado') {
                return { tipo: 'respuesta', texto: r.datos?.mensaje ?? 'Listo.', meta };
            }
            return error(r.mensaje ?? 'No pude hacerlo.', meta, 'ejecucion');
        } catch (e) {
            return desdeError(e, meta);
        }
    }
}

module.exports = AsistenteService;
