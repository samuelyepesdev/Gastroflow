const TOOLS = require('./herramientas');
const { ToolError, AclaracionError, mensajeDe } = require('../../Tenant/Asistente/tools/errores');

/**
 * Herramientas del asistente del superadmin. Todas son de LECTURA: no hay confirmación porque no hay
 * nada que confirmar. El modelo solo elige una por nombre con argumentos de texto; no recibe ni envía
 * ids de restaurante ni escribe SQL.
 */
class AsistenteSistemaTools {
    static definiciones() {
        return Object.entries(TOOLS).map(([name, t]) => ({
            name,
            description: t.descripcion,
            parameters: t.parametros
        }));
    }

    /** @returns {Promise<{tipo:'resultado',datos}|{tipo:'aclaracion'|'error',mensaje}>} */
    static async preparar(nombre, args) {
        try {
            if (typeof nombre !== 'string' || !Object.prototype.hasOwnProperty.call(TOOLS, nombre)) {
                throw new ToolError('No sé hacer eso.');
            }
            return { tipo: 'resultado', datos: await TOOLS[nombre].preparar(args || {}) };
        } catch (e) {
            return { tipo: e instanceof AclaracionError ? 'aclaracion' : 'error', mensaje: mensajeDe(e) };
        }
    }
}

module.exports = AsistenteSistemaTools;
