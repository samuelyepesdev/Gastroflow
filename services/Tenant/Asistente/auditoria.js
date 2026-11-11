const TenantAuditService = require('../../Admin/TenantAuditService');
const { limpiar } = require('./tools/validacion');

const MAX_TEXTO_AUDITADO = 300;

/**
 * Deja rastro de lo que hizo el asistente en tenant_audit (acciones `asistente.*`).
 * Solo se guarda lo necesario para revisar qué pasó: el texto del comando, qué herramientas se usaron y con
 * qué resultado, y el consumo de tokens. Nunca la clave del proveedor, ni el cuerpo que éste devolvió, ni
 * el id de confirmación. Si la auditoría falla NO se rompe la respuesta al usuario.
 *
 * @param {{tenantId:number, userId:number}} ctx
 * @param {'asistente.comando'|'asistente.confirmar'} accion
 * @param {Object} resultado - lo que devolvió AsistenteService (usa tipo, codigo y meta)
 * @param {Object} [extra] - campos adicionales a guardar (texto, aceptar)
 */
async function registrar(ctx, accion, resultado, extra = {}) {
    try {
        const detalles = { ...extra };
        if (typeof detalles.texto === 'string') {
            detalles.texto = limpiar(detalles.texto, MAX_TEXTO_AUDITADO);
        }
        detalles.tipo = resultado.tipo;
        if (resultado.codigo) {
            detalles.codigo = resultado.codigo;
        }
        detalles.herramientas = resultado.meta?.herramientas ?? [];
        detalles.tokens = resultado.meta?.uso?.total ?? null;

        await TenantAuditService.log({
            tenantId: ctx.tenantId,
            userId: ctx.userId,
            accion,
            detalles: JSON.stringify(detalles)
        });
    } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[asistente] no se pudo registrar la auditoría:', e?.code || e?.name);
    }
}

module.exports = { registrar };
