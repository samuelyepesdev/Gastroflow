const AgregarItemService = require('../../../../../services/Tenant/Mesas/AgregarItemService');
const AgregarServicioService = require('../../../../../services/Tenant/Mesas/AgregarServicioService');
const AgregarComboService = require('../../../../../services/Tenant/Mesas/AgregarComboService');
const EliminarItemService = require('../../../../../services/Tenant/Mesas/EliminarItemService');
const UpdateItemCantidadService = require('../../../../../services/Tenant/Mesas/UpdateItemCantidadService');
const UpdateItemEstadoService = require('../../../../../services/Tenant/Mesas/UpdateItemEstadoService');
const PagarItemIndividualService = require('../../../../../services/Tenant/Mesas/PagarItemIndividualService');
const PagarMultiplesItemsService = require('../../../../../services/Tenant/Mesas/PagarMultiplesItemsService');
const AuthService = require('../../../../../services/Shared/AuthService');

class PedidoItemsController {
    // POST /mesas/pedidos/:pedidoId/items
    static async store(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const { pedidoId } = req.params;
            const { producto_id, cantidad, unidad, precio, nota, modificadores_seleccion } = req.body;
            const puedeUsarModificadores = AuthService.hasPermission(req.user?.permisos, 'modificadores.ver');
            const resultado = await AgregarItemService.execute({
                tenantId,
                pedidoId,
                producto_id,
                cantidad,
                unidad,
                precio,
                nota,
                modificadores_seleccion,
                puedeUsarModificadores
            });
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
            const resultado = await AgregarServicioService.execute({
                tenantId,
                pedidoId,
                servicio_id,
                cantidad,
                precio,
                nota
            });
            return res.status(201).json(resultado);
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }
    }

    // POST /mesas/pedidos/:pedidoId/combos
    static async addCombo(req, res) {
        try {
            const { pedidoId } = req.params;
            const { combo_id, cantidad, selecciones, nota } = req.body;
            const resultado = await AgregarComboService.execute({
                tenantId: req.tenant?.id,
                pedidoId,
                combo_id,
                cantidad,
                selecciones,
                nota
            });
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
            const resultado = await PagarItemIndividualService.execute({
                tenantId,
                itemId,
                forma_pago,
                cantidad,
                usuarioId: req.user?.id || null
            });
            res.json(resultado);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    // POST /mesas/items/pagar-multiples
    static async pagarMultiples(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const { items, forma_pago } = req.body;
            const resultado = await PagarMultiplesItemsService.execute({
                tenantId,
                items,
                forma_pago,
                usuarioId: req.user?.id || null
            });
            res.json(resultado);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
}

module.exports = PedidoItemsController;
