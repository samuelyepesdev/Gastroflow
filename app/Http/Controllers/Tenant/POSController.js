const POSService = require('../../../../services/Tenant/POSService');
const logger = require('../../../../utils/logger');

class POSController {
    static async index(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res
                    .status(403)
                    .render('errors/internal', {
                        error: { message: 'Contexto de tenant no disponible' },
                        user: req.user
                    });
            }
            const { productos, categorias } = await POSService.getProductosForPOS(tenantId);
            res.render('pos/index', { user: req.user, tenant: req.tenant, productos, categorias });
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
            logger.error('POS getBorradores error', { err: err.message });
            res.status(500).json({ error: 'Error al obtener órdenes guardadas' });
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
}

module.exports = POSController;
