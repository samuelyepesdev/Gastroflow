const AsistenteRepository = require('../../../../repositories/Tenant/AsistenteRepository');
const LiberarMesaService = require('../../Mesas/LiberarMesaService');
const { idEstricto } = require('./validacion');
const { ToolError, mensajeDe } = require('./errores');
const { etiquetaMesa } = require('./resolucion');

/** Tope por confirmación: una lista que no cabe en una frase leída en voz alta tampoco se revisa bien. */
const MAX_MESAS = 30;

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

module.exports = {
    tipo: 'escritura',
    permiso: 'mesas.ver',
    modulo: 'mesas',
    descripcion:
        'Libera de una vez TODAS las mesas ocupadas que no tienen productos activos ni abonos (por ejemplo, abiertas por error). Úsala para "libera las mesas vacías" o "libera las que no tienen items". No sirve para mesas con productos.',
    parametros: { type: 'object', properties: {} },

    async preparar(ctx) {
        const mesas = (await AsistenteRepository.mesasOcupadasSinItems(ctx.tenantId)).slice(0, MAX_MESAS);
        if (mesas.length === 0) {
            return { tipo: 'resultado', datos: { mensaje: 'No hay mesas ocupadas sin productos para liberar.' } };
        }
        return {
            tipo: 'confirmacion',
            resumen: `Liberar ${plural(mesas.length, 'mesa vacía', 'mesas vacías')}: ${mesas.map(etiquetaMesa).join(', ')}.`,
            accion: { tool: 'liberar_mesas_vacias', payload: { mesa_ids: mesas.map(m => m.id) } }
        };
    },

    async ejecutar(ctx, payload) {
        const ids = payload?.mesa_ids;
        if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_MESAS) {
            throw new ToolError('Acción inválida (mesas).');
        }
        const unicos = [...new Set(ids.map(id => idEstricto(id, 'mesa')))];

        let liberadas = 0;
        for (const mesaId of unicos) {
            try {
                // Revisa los items bajo bloqueo: si la mesa recibió algo desde la propuesta, rechaza y se omite.
                await LiberarMesaService.execute({ tenantId: ctx.tenantId, mesaId });
                liberadas++;
            } catch (e) {
                // Una mesa que ya no se puede liberar no detiene las demás.
                // eslint-disable-next-line no-console
                console.error('[asistente] liberar_mesas_vacias omitió una mesa:', mensajeDe(e));
            }
        }

        const omitidas = unicos.length - liberadas;
        if (liberadas === 0) {
            throw new ToolError('No se liberó ninguna mesa: ya tienen productos o cambiaron de estado.');
        }
        const mensaje =
            omitidas === 0
                ? `Listo, liberé ${plural(liberadas, 'mesa', 'mesas')}.`
                : `Liberé ${plural(liberadas, 'mesa', 'mesas')}; ${plural(omitidas, 'no se liberó', 'no se liberaron')} porque ya tienen productos.`;
        return { tipo: 'resultado', datos: { mensaje } };
    }
};
