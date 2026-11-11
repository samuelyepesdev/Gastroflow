const TOOLS = require('./tools');
const { ToolError, AclaracionError, mensajeDe } = require('./tools/errores');

/**
 * Orquesta las herramientas cerradas del asistente (ver ./tools). El modelo de lenguaje solo puede pedir
 * una por nombre, con argumentos de texto: nunca recibe ni envía tenant_id, nunca escribe SQL.
 *
 * Ciclo de una herramienta:
 *   - lectura:   `preparar` devuelve el resultado directamente.
 *   - escritura: `preparar` NO escribe nada, devuelve un resumen y una acción con ids ya resueltos.
 *                Solo tras la confirmación del usuario se llama a `ejecutar` (que vuelve a verificar
 *                permisos y datos, porque entre ambos pasos puede haber cambiado todo).
 *
 * Contexto (`ctx`): { tenantId, userId, permisos, allowedByPlan } sale SIEMPRE de la sesión autenticada.
 */
class AsistenteToolsService {
    /** ¿El usuario puede usar esta herramienta? Exige permiso Y que el plan incluya el módulo. */
    static _tieneAcceso(ctx, tool) {
        return (
            Number.isInteger(ctx?.tenantId) &&
            ctx.tenantId > 0 &&
            Array.isArray(ctx.permisos) &&
            ctx.permisos.includes(tool.permiso) &&
            ctx.allowedByPlan?.[tool.modulo] === true
        );
    }

    static _herramienta(ctx, nombre) {
        if (typeof nombre !== 'string' || !Object.prototype.hasOwnProperty.call(TOOLS, nombre)) {
            throw new ToolError('No sé hacer eso.');
        }
        const tool = TOOLS[nombre];
        if (!AsistenteToolsService._tieneAcceso(ctx, tool)) {
            throw new ToolError('No tienes permiso para esa acción.');
        }
        return tool;
    }

    static _respuestaDeError(e) {
        if (e instanceof AclaracionError) {
            return { tipo: 'aclaracion', mensaje: e.message };
        }
        return { tipo: 'error', mensaje: mensajeDe(e) };
    }

    /** Definiciones en formato function-calling, solo de lo que este usuario puede usar. */
    static definiciones(ctx) {
        return Object.entries(TOOLS)
            .filter(([, tool]) => AsistenteToolsService._tieneAcceso(ctx, tool))
            .map(([name, tool]) => ({ name, description: tool.descripcion, parameters: tool.parametros }));
    }

    /**
     * Lectura: devuelve el resultado. Escritura: devuelve la propuesta, SIN escribir.
     * @returns {Promise<{tipo:'resultado',datos:Object}|{tipo:'confirmacion',resumen:string,accion:Object}|{tipo:'aclaracion',mensaje:string}|{tipo:'error',mensaje:string}>}
     */
    static async preparar(ctx, nombre, args) {
        try {
            const tool = AsistenteToolsService._herramienta(ctx, nombre);
            if (args === null || typeof args !== 'object' || Array.isArray(args)) {
                throw new ToolError('Argumentos inválidos.');
            }
            return await tool.preparar(ctx, args);
        } catch (e) {
            return AsistenteToolsService._respuestaDeError(e);
        }
    }

    /** Ejecuta una acción de escritura ya confirmada. Vuelve a comprobar permisos y datos. */
    static async ejecutar(ctx, accion) {
        try {
            const tool = AsistenteToolsService._herramienta(ctx, accion?.tool);
            if (tool.tipo !== 'escritura') {
                throw new ToolError('Esa acción no se puede ejecutar.');
            }
            return await tool.ejecutar(ctx, accion.payload);
        } catch (e) {
            return AsistenteToolsService._respuestaDeError(e);
        }
    }
}

module.exports = AsistenteToolsService;
