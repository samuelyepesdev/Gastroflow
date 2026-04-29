const LiberarMesaService = require('../../../../services/Tenant/Mesas/LiberarMesaService');
const MoverPedidoService = require('../../../../services/Tenant/Mesas/MoverPedidoService');
const MoverItemsService = require('../../../../services/Tenant/Mesas/MoverItemsService');

class MesaActionsController {
    // PUT /mesas/:mesaId/liberar
    static async liberar(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const { mesaId } = req.params;
            const resultado = await LiberarMesaService.execute({ tenantId, mesaId });
            return res.json(resultado);
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }
    }

    // PUT /mesas/pedidos/:pedidoId/mover
    static async moverPedido(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const { pedidoId } = req.params;
            const { mesa_destino_id } = req.body;
            const resultado = await MoverPedidoService.execute({ tenantId, pedidoId, mesa_destino_id });
            return res.json(resultado);
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }
    }

    // POST /mesas/pedidos/:pedidoId/mover-items
    static async moverItems(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const pedidoOrigenId = req.params.pedidoId;
            const { itemIds, mesa_destino_id } = req.body;
            const resultado = await MoverItemsService.execute({ tenantId, pedidoOrigenId, itemIds, mesa_destino_id });
            return res.json(resultado);
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }
    }
}

module.exports = MesaActionsController;
