const TenantService = require('../../../../services/Admin/TenantService');
const VentaService = require('../../../../services/Tenant/VentaService');
const FacturaRepository = require('../../../../repositories/Tenant/FacturaRepository');

class VentasController {
    // GET /admin/ventas
    static async index(req, res) {
        try {
            const tenants = await TenantService.getAllTenants();
            let activeTenantId = req.query.tenantId;
            if (!activeTenantId) {
                activeTenantId = 'all'; // Default to all so they see all 474+ invoices!
            } else if (activeTenantId !== 'all') {
                activeTenantId = Number(activeTenantId);
            }

            let ventas = [];
            if (activeTenantId) {
                ventas = await VentaService.getWithFilters(activeTenantId, {
                    desde: req.query.desde || undefined,
                    hasta: req.query.hasta || undefined,
                    q: req.query.q || undefined
                });
            }
            res.render('admin/ventas', {
                user: req.user,
                tenants,
                ventas,
                activeTenantId
            });
        } catch (error) {
            console.error('Error al cargar ventas admin:', error);
            res.status(500).render('errors/internal', { error });
        }
    }

    // DELETE /admin/ventas/:id
    static async destroy(req, res) {
        try {
            const facturaId = parseInt(req.params.id);
            if (!facturaId) return res.status(400).json({ error: 'ID inválido' });
            const result = await FacturaRepository.deleteById(facturaId);
            if (!result.deleted) return res.status(404).json({ error: 'Venta no encontrada' });
            res.json({ success: true, message: 'Venta eliminada correctamente' });
        } catch (error) {
            console.error('Error al eliminar venta:', error);
            res.status(500).json({ error: error.message || 'Error al eliminar' });
        }
    }
}

module.exports = VentasController;
