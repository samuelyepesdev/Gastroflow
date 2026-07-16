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
// casi no cambian en runtime). planes/addons se agregan aquí porque
// requirePlanFeature (middleware/planFeature.js) los necesita resueltos
// localmente para no rechazar con 403 casi todas las rutas.
const GLOBAL_FULL_TABLES = ['permisos', 'rol_permisos', 'planes', 'addons'];

// Tablas globales pero con updated_at: delta por fecha, sin filtro de tenant.
const GLOBAL_INCREMENTAL_TABLES = ['roles'];

// Tablas del tenant con updated_at: delta por fecha y por tenant_id.
// categorias parece global en su CREATE TABLE original (002), pero la
// migración 003 (multi-tenancy) le agregó tenant_id + FK a tenants — sin
// filtrar por tenant acá se traían categorías de TODOS los tenants (fuga de
// datos) y el INSERT local fallaba por la FK al no existir esos otros
// tenants localmente. Confirmado con `grep` sobre todas las migraciones
// antes de asumir cuáles tablas son realmente globales.
const TENANT_INCREMENTAL_TABLES = [
    'usuarios',
    'mesas',
    'productos',
    'servicios',
    'clientes',
    'temas',
    'parametros',
    'categorias'
];

// Tablas del tenant sin updated_at: completas cada vez, filtradas por tenant_id (chicas).
const TENANT_FULL_TABLES = ['tenant_addons'];

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

        // La fila del propio tenant siempre va completa: mesas/productos/etc.
        // tienen FOREIGN KEY (tenant_id) REFERENCES tenants(id), así que sin
        // esto el INSERT local fallaría por integridad referencial.
        data.tenants = await SyncRepository.findTenantRow(tenantId);

        for (const table of GLOBAL_FULL_TABLES) {
            data[table] = await SyncRepository.findAll(table);
        }
        for (const table of GLOBAL_INCREMENTAL_TABLES) {
            data[table] = await SyncRepository.findChanged(table, since);
        }
        for (const table of TENANT_INCREMENTAL_TABLES) {
            data[table] = await SyncRepository.findChangedByTenant(table, tenantId, since);
        }
        for (const table of TENANT_FULL_TABLES) {
            data[table] = await SyncRepository.findAllByTenant(table, tenantId);
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
