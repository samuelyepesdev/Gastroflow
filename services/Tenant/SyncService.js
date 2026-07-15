/**
 * SyncService - Pull (bootstrap/delta de catálogo) y push (cola de operaciones
 * offline) para el prototipo de escritorio. El push no reimplementa reglas de
 * negocio: despacha cada acción al mismo *Service.execute() que ya usan los
 * controllers web, así el resultado es idéntico se venda desde la web o desde
 * el desktop.
 *
 * Alcance actual (un solo terminal por tenant, ver README de electron/):
 * no hay detección de conflictos por versión. Si en el futuro se soporta más
 * de una caja por restaurante, esto necesita revisarse antes de confiar en él.
 */

const SyncRepository = require('../../repositories/Tenant/SyncRepository');
const AbrirPedidoService = require('./Mesas/AbrirPedidoService');
const AgregarItemService = require('./Mesas/AgregarItemService');
const AgregarServicioService = require('./Mesas/AgregarServicioService');
const UpdateItemCantidadService = require('./Mesas/UpdateItemCantidadService');
const EliminarItemService = require('./Mesas/EliminarItemService');
const UpdatePropinaService = require('./Mesas/UpdatePropinaService');

// Tablas globales, sin tenant_id: se mandan completas siempre (son chicas y
// casi no cambian en runtime).
const GLOBAL_FULL_TABLES = ['permisos', 'rol_permisos'];

// Tablas globales pero con updated_at: delta por fecha, sin filtro de tenant.
const GLOBAL_INCREMENTAL_TABLES = ['roles', 'categorias'];

// Tablas del tenant con updated_at: delta por fecha y por tenant_id.
const TENANT_INCREMENTAL_TABLES = ['usuarios', 'mesas', 'productos', 'servicios', 'clientes', 'temas', 'parametros'];

// Despacho de acciones del push: cada una delega en el Service que ya usa el
// endpoint web equivalente (ver PedidoController / PedidoItemsController).
const ACTIONS = {
    'mesas.abrir_pedido': params => AbrirPedidoService.execute(params),
    'pedido_items.agregar': params => AgregarItemService.execute(params),
    'pedido_items.agregar_servicio': params => AgregarServicioService.execute(params),
    'pedido_items.actualizar_cantidad': params => UpdateItemCantidadService.execute(params),
    'pedido_items.eliminar': params => EliminarItemService.execute(params),
    'pedidos.actualizar_propina': params => UpdatePropinaService.execute(params)
};

class SyncService {
    static async pull(tenantId, since) {
        const data = {};

        for (const table of GLOBAL_FULL_TABLES) {
            data[table] = await SyncRepository.findAll(table);
        }
        for (const table of GLOBAL_INCREMENTAL_TABLES) {
            data[table] = await SyncRepository.findChanged(table, since);
        }
        for (const table of TENANT_INCREMENTAL_TABLES) {
            data[table] = await SyncRepository.findChangedByTenant(table, tenantId, since);
        }

        data.syncedAt = await SyncRepository.serverNow();
        return data;
    }

    static async push(tenantId, operations) {
        const results = [];
        for (const operation of operations) {
            results.push(await SyncService._applyOne(tenantId, operation));
        }
        return results;
    }

    static async _applyOne(tenantId, { clientUuid, action, params }) {
        if (!clientUuid || !action) {
            return { clientUuid: clientUuid || null, status: 'error', error: 'clientUuid y action son requeridos' };
        }

        const logged = await SyncRepository.findLoggedOperation(tenantId, clientUuid);
        if (logged) {
            return { clientUuid, status: logged.status, serverId: logged.server_entity_id };
        }

        const handler = ACTIONS[action];
        if (!handler) {
            await SyncRepository.logOperation(tenantId, clientUuid, action, 'error', null);
            return { clientUuid, status: 'error', error: `Acción de sync desconocida: ${action}` };
        }

        try {
            const result = await handler({ tenantId, ...(params || {}) });
            const serverId = result?.id ?? result?.pedido?.id ?? null;
            await SyncRepository.logOperation(tenantId, clientUuid, action, 'applied', serverId);
            return { clientUuid, status: 'applied', serverId, result };
        } catch (error) {
            await SyncRepository.logOperation(tenantId, clientUuid, action, 'error', null);
            return { clientUuid, status: 'error', error: error.message };
        }
    }
}

module.exports = SyncService;
