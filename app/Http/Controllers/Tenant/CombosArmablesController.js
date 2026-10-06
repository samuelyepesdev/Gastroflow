const ComboArmableService = require('../../../../services/Tenant/ComboArmableService');
const ProductRepository = require('../../../../repositories/Tenant/ProductRepository');
const EstacionRepository = require('../../../../repositories/Tenant/EstacionRepository');

// Editor de combos armables ("arma tu combo"). Convive con /combos (combos fijos como producto)
// hasta que Mesas/POS/QR vendan con el modelo nuevo.
class CombosArmablesController {
    // GET /combos-armables
    static async index(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res
                    .status(403)
                    .render('errors/generic', { error: { message: 'Contexto de tenant no disponible' } });
            }
            const [combos, productos, estaciones] = await Promise.all([
                ComboArmableService.listar(tenantId),
                ProductRepository.findAll(tenantId),
                EstacionRepository.findAll(tenantId, { soloActivas: true })
            ]);
            res.render('combos/armables', {
                combos: combos || [],
                // Un combo no contiene otros combos (los combos fijos viejos siguen siendo productos es_combo).
                productos: (productos || []).filter(p => !p.es_combo),
                estaciones: estaciones || [],
                user: req.user,
                tenant: req.tenant
            });
        } catch (error) {
            console.error('Error al obtener combos armables:', error);
            res.status(500).render('errors/generic', { error: { message: 'Error al obtener combos' } });
        }
    }

    // GET /api/combos-venta - catálogo para vender (cualquier usuario del tenant que facture)
    static async venta(req, res) {
        try {
            res.json(await ComboArmableService.listarParaVenta(req.tenant?.id));
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // GET /combos-armables/:id
    static async show(req, res) {
        try {
            res.json(await ComboArmableService.getDetalle(Number.parseInt(req.params.id, 10), req.tenant?.id));
        } catch (error) {
            res.status(404).json({ error: error.message });
        }
    }

    // POST /combos-armables
    static async store(req, res) {
        try {
            res.status(201).json(await ComboArmableService.crear(req.tenant?.id, req.body));
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    // PUT /combos-armables/:id
    static async update(req, res) {
        try {
            res.json(
                await ComboArmableService.actualizar(Number.parseInt(req.params.id, 10), req.tenant?.id, req.body)
            );
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    // DELETE /combos-armables/:id
    static async destroy(req, res) {
        try {
            res.json(await ComboArmableService.eliminar(Number.parseInt(req.params.id, 10), req.tenant?.id));
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
}

module.exports = CombosArmablesController;
