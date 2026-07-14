const PlanService = require('../../../../services/Admin/PlanService');
const AddonService = require('../../../../services/Admin/AddonService');
const TenantService = require('../../../../services/Admin/TenantService');
const JobQueueRepository = require('../../../../repositories/Shared/JobQueueRepository');

class PlanesController {
    // GET /admin/planes
    static async index(req, res) {
        try {
            const [plans, tenantsRaw, addons] = await Promise.all([
                PlanService.getAll(),
                TenantService.getAllTenants(),
                AddonService.getAll()
            ]);
            const tenants = await AddonService.enrichTenants(tenantsRaw, plans);

            const serverData = JSON.stringify({
                addons,
                plans,
                tenants: tenants.map(t => ({
                    id: t.id,
                    nombre: t.nombre,
                    slug: t.slug,
                    plan_id: t.plan_id || null,
                    plan_nombre: t.plan_nombre || 'Sin plan',
                    plan_slug: t.plan_slug || '',
                    tamano: t.tamano || 'pequeno',
                    addonIds: (t.addons || []).map(a => a.id)
                }))
            });

            res.render('admin/planes', { user: req.user, plans, tenants, addons, serverData });
        } catch (error) {
            console.error('Error al cargar planes:', error);
            res.status(500).render('errors/internal', { error });
        }
    }

    // PUT /api/planes/:id/precios
    static async updatePrices(req, res) {
        try {
            const { precio_pequeno, precio_mediano, precio_grande } = req.body;
            const plan = await PlanService.updatePrecios(Number(req.params.id), {
                precio_pequeno,
                precio_mediano,
                precio_grande
            });
            res.json({ ok: true, plan });
        } catch (error) {
            console.error('Error al actualizar precios del plan:', error);
            res.status(400).json({ error: error.message || 'Error al actualizar precios' });
        }
    }

    // PUT /api/planes/:id
    static async updateGeneral(req, res) {
        try {
            const { nombre, descripcion, descripcion_detallada } = req.body;
            const plan = await PlanService.updateGeneral(Number(req.params.id), {
                nombre,
                descripcion,
                descripcion_detallada
            });
            res.json({ ok: true, plan });
        } catch (error) {
            console.error('Error al actualizar datos del plan:', error);
            res.status(400).json({ error: error.message || 'Error al actualizar datos' });
        }
    }

    // GET /admin/planes/exportar-pdf - encola la generación (puppeteer es pesado, no
    // debe bloquear el request). El frontend hace polling a /admin/jobs/:id y descarga
    // desde /admin/jobs/:id/download cuando el worker termina.
    static async exportPdf(req, res) {
        try {
            const jobId = await JobQueueRepository.encolar('pdf_planes', {});
            res.json({ jobId });
        } catch (error) {
            console.error('[PDF_EXPORT_ERROR]:', error);
            res.status(500).json({ error: 'Error al encolar la generación del PDF.' });
        }
    }

    // GET /api/addons
    static async listAddons(req, res) {
        try {
            const addons = await AddonService.getAll();
            res.json(addons);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // PUT /api/addons/:id
    static async updateAddon(req, res) {
        try {
            const addon = await AddonService.update(Number(req.params.id), req.body);
            res.json({ ok: true, addon });
        } catch (error) {
            console.error('Error al actualizar add-on:', error);
            res.status(400).json({ error: error.message || 'Error al actualizar add-on' });
        }
    }

    // GET /api/tenant/:tenantId/addons
    static async getTenantAddons(req, res) {
        try {
            const addons = await AddonService.getByTenant(Number(req.params.tenantId));
            res.json(addons);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // POST /api/tenant/:tenantId/addons
    static async addAddonToTenant(req, res) {
        try {
            const { addon_id } = req.body;
            if (!addon_id) {
                return res.status(400).json({ error: 'addon_id requerido' });
            }
            await AddonService.addToTenant(Number(req.params.tenantId), Number(addon_id));
            res.json({ ok: true });
        } catch (error) {
            console.error('Error al agregar add-on al tenant:', error);
            res.status(400).json({ error: error.message || 'Error al agregar add-on' });
        }
    }

    // DELETE /api/tenant/:tenantId/addons/:addonId
    static async removeAddonFromTenant(req, res) {
        try {
            await AddonService.removeFromTenant(Number(req.params.tenantId), Number(req.params.addonId));
            res.json({ ok: true });
        } catch (error) {
            console.error('Error al quitar add-on del tenant:', error);
            res.status(400).json({ error: error.message || 'Error al quitar add-on' });
        }
    }

    // PUT /api/tenant/:tenantId/tamano
    static async updateTenantTamano(req, res) {
        try {
            const { tamano } = req.body;
            await AddonService.updateTamano(Number(req.params.tenantId), tamano);
            res.json({ ok: true });
        } catch (error) {
            console.error('Error al actualizar tamaño del tenant:', error);
            res.status(400).json({ error: error.message || 'Error al actualizar tamaño' });
        }
    }
}

module.exports = PlanesController;
