const POSService = require('../../../../services/Tenant/POSService');
const FacturaService = require('../../../../services/Tenant/FacturaService');
const CajaService = require('../../../../services/Tenant/CajaService');
const logger = require('../../../../utils/logger');

class POSController {
    static async index(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).render('errors/internal', {
                    error: { message: 'Contexto de tenant no disponible' },
                    user: req.user
                });
            }
            const { productos, categorias } = await POSService.getProductosForPOS(tenantId);
            const avisoCajaCerrada = await CajaService.debeAvisarCajaCerrada(tenantId);
            res.render('pos/index', { user: req.user, tenant: req.tenant, productos, categorias, avisoCajaCerrada });
        } catch (err) {
            logger.error('POS index error', { err: err.message });
            res.status(500).render('errors/internal', { error: err, user: req.user });
        }
    }

    static async getProductos(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const { productos, categorias } = await POSService.getProductosForPOS(tenantId);
            res.json({ productos, categorias });
        } catch (err) {
            logger.error('POS getProductos error', { err: err.message });
            res.status(500).json({ error: 'Error al obtener productos' });
        }
    }

    static async getBorradores(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const usuarioId = req.user.id;
            const borradores = await POSService.getBorradores(tenantId, usuarioId);
            res.json(borradores);
        } catch (err) {
            // Si la tabla pos_borradores no existe, retornar array vacío (migración pendiente)
            logger.warn('POS getBorradores error', { err: err.message });
            res.json([]);
        }
    }

    static async saveBorrador(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const usuarioId = req.user.id;
            const result = await POSService.saveBorrador(tenantId, usuarioId, req.body);
            res.status(201).json(result);
        } catch (err) {
            logger.warn('POS saveBorrador error', { err: err.message });
            res.status(400).json({ error: err.message });
        }
    }

    static async deleteBorrador(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const id = parseInt(req.params.id);
            const deleted = await POSService.deleteBorrador(id, tenantId);
            if (!deleted) {
                return res.status(404).json({ error: 'Orden no encontrada' });
            }
            res.json({ ok: true });
        } catch (err) {
            logger.error('POS deleteBorrador error', { err: err.message });
            res.status(500).json({ error: 'Error al eliminar la orden' });
        }
    }

    static async getStats(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const stats = await POSService.getStatsHoy(tenantId);
            res.json(stats);
        } catch (err) {
            logger.error('POS getStats error', { err: err.message });
            res.status(500).json({ error: 'Error al obtener estadísticas' });
        }
    }

    static async getConsumidorFinal(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const id = await POSService.findOrCreateCliente(tenantId, 'Consumidor final');
            res.json({ id, nombre: 'Consumidor final' });
        } catch (err) {
            logger.error('POS getConsumidorFinal error', { err: err.message });
            res.status(500).json({ error: 'Error al obtener consumidor final' });
        }
    }

    static async vender(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const { nombre_cliente, forma_pago, productos, total } = req.body;
            let { cliente_id } = req.body;

            if (!cliente_id) {
                const nombre = (nombre_cliente || 'Consumidor final').trim();
                cliente_id = await POSService.findOrCreateCliente(tenantId, nombre);
            }

            const result = await FacturaService.create(tenantId, {
                cliente_id,
                total,
                forma_pago,
                productos,
                usuario_id: req.user.id
            });
            res.status(201).json(result);
        } catch (err) {
            logger.warn('POS vender error', { err: err.message });
            res.status(400).json({ error: err.message });
        }
    }
}

module.exports = POSController;
