const AgregarItemService = require('../../../../../services/Tenant/Mesas/AgregarItemService');
const AgregarServicioService = require('../../../../../services/Tenant/Mesas/AgregarServicioService');
const EliminarItemService = require('../../../../../services/Tenant/Mesas/EliminarItemService');
const UpdateItemCantidadService = require('../../../../../services/Tenant/Mesas/UpdateItemCantidadService');
const UpdateItemEstadoService = require('../../../../../services/Tenant/Mesas/UpdateItemEstadoService');
const PagarItemIndividualService = require('../../../../../services/Tenant/Mesas/PagarItemIndividualService');

class PedidoItemsController {
    // POST /mesas/pedidos/:pedidoId/items
    static async store(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const { pedidoId } = req.params;
            const { producto_id, cantidad, unidad, precio, nota } = req.body;
            const resultado = await AgregarItemService.execute({ tenantId, pedidoId, producto_id, cantidad, unidad, precio, nota });
            return res.status(201).json(resultado);
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }
    }

    // POST /mesas/pedidos/:pedidoId/servicios
    static async addService(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const { pedidoId } = req.params;
            const { servicio_id, cantidad, precio, nota } = req.body;
            const resultado = await AgregarServicioService.execute({ tenantId, pedidoId, servicio_id, cantidad, precio, nota });
            return res.status(201).json(resultado);
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }
    }

    // PUT /mesas/items/:itemId/cantidad
    static async updateCantidad(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const { itemId } = req.params;
            const { cantidad } = req.body;
            const resultado = await UpdateItemCantidadService.execute({ tenantId, itemId, cantidad });
            res.json(resultado);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    // DELETE /mesas/items/:itemId
    static async destroy(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const { itemId } = req.params;
            const resultado = await EliminarItemService.execute({ tenantId, itemId });
            res.json(resultado);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    // PUT /mesas/items/:itemId/enviar
    static async enviar(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const { itemId } = req.params;
            const resultado = await UpdateItemEstadoService.execute({ tenantId, itemId, estado: 'enviado' });
            res.json(resultado);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    // PUT /mesas/items/:itemId/estado
    static async updateEstado(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const { itemId } = req.params;
            const { estado } = req.body;
            const resultado = await UpdateItemEstadoService.execute({ tenantId, itemId, estado });
            res.json(resultado);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    // PUT /mesas/items/:itemId/pagar
    static async pagar(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const { itemId } = req.params;
            const { forma_pago, cantidad } = req.body;
            const resultado = await PagarItemIndividualService.execute({ tenantId, itemId, forma_pago, cantidad });
            res.json(resultado);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
}

module.exports = PedidoItemsController;
