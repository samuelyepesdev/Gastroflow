const AbrirPedidoService = require('../../../../../services/Tenant/Mesas/AbrirPedidoService');
const AuthService = require('../../../../../services/Shared/AuthService');
const GetPedidoDetailsService = require('../../../../../services/Tenant/Mesas/GetPedidoDetailsService');
const UpdatePropinaService = require('../../../../../services/Tenant/Mesas/UpdatePropinaService');
const AsociarClientePedidoService = require('../../../../../services/Tenant/Mesas/AsociarClientePedidoService');
const LimpiarPedidoService = require('../../../../../services/Tenant/Mesas/LimpiarPedidoService');
const FacturarPedidoService = require('../../../../../services/Tenant/Mesas/FacturarPedidoService');
const AbonoPedidoService = require('../../../../../services/Tenant/Mesas/AbonoPedidoService');

class PedidoController {
    // POST /mesas/abrir
    static async abrir(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const { mesa_id, cliente_id, notas } = req.body;
            const pedido = await AbrirPedidoService.execute({ tenantId, mesa_id, cliente_id, notas });
            return res.status(201).json({ pedido });
        } catch (error) {
            return res.status(error.message === 'Mesa no encontrada' ? 404 : 500).json({ error: error.message });
        }
    }

    // GET /mesas/pedidos/:pedidoId
    static async show(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const { pedidoId } = req.params;
            const data = await GetPedidoDetailsService.execute({ tenantId, pedidoId });
            res.json(data);
        } catch (error) {
            res.status(error.message === 'Pedido no encontrado' ? 404 : 500).json({ error: error.message });
        }
    }

    // PATCH /mesas/pedidos/:pedidoId/propina
    static async updatePropina(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const { pedidoId } = req.params;
            const { propina } = req.body;
            const result = await UpdatePropinaService.execute({ tenantId, pedidoId, propina });
            res.json(result);
        } catch (error) {
            res.status(error.message === 'Pedido no encontrado' ? 404 : 500).json({ error: error.message });
        }
    }

    // PUT /pedidos/:pedidoId/cliente
    static async updateCliente(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const { pedidoId } = req.params;
            const { cliente_id } = req.body;
            const result = await AsociarClientePedidoService.execute({ tenantId, pedidoId, cliente_id });
            res.json(result);
        } catch (error) {
            res.status(error.message === 'Cliente no encontrado' ? 404 : 500).json({ error: error.message });
        }
    }

    // DELETE /mesas/pedidos/:pedidoId/limpiar
    static async limpiar(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const { pedidoId } = req.params;
            const result = await LimpiarPedidoService.execute({ tenantId, pedidoId });
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // POST /mesas/pedidos/:pedidoId/facturar
    static async facturar(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const { pedidoId } = req.params;
            const { cliente_id, forma_pago, descuentos, propina, efectivo_recibido, codigo_bono } = req.body;
            const descuentosMap = descuentos && typeof descuentos === 'object' ? descuentos : {};

            const resultado = await FacturarPedidoService.execute({
                tenantId,
                pedidoId,
                cliente_id,
                forma_pago,
                descuentosMap,
                propinaBody: propina,
                usuarioId: req.user?.id || null,
                efectivoRecibido: efectivo_recibido ?? null,
                codigoBono: codigo_bono || null,
                puedeAplicarDescuento: AuthService.hasPermission(req.user?.permisos, 'ventas.aplicar_descuento')
            });
            return res.status(201).json(resultado);
        } catch (error) {
            return res.status(error.status === 403 ? 403 : 500).json({ error: error.message });
        }
    }

    // POST /mesas/pedidos/:pedidoId/abonos
    static async registrarAbono(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const { pedidoId } = req.params;
            const { monto, forma_pago, nota } = req.body;
            const resultado = await AbonoPedidoService.registrar({
                tenantId,
                pedidoId,
                monto,
                forma_pago,
                usuarioId: req.user?.id || null,
                nota
            });
            return res.status(201).json(resultado);
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }
    }

    // GET /mesas/pedidos/:pedidoId/abonos
    static async listarAbonos(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const { pedidoId } = req.params;
            const resultado = await AbonoPedidoService.listar(tenantId, pedidoId);
            res.json(resultado);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    // DELETE /mesas/abonos/:abonoId
    static async eliminarAbono(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const { abonoId } = req.params;
            const resultado = await AbonoPedidoService.eliminar({ tenantId, abonoId });
            res.json(resultado);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
}

module.exports = PedidoController;
