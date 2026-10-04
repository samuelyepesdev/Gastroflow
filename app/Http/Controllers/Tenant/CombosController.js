const ComboService = require('../../../../services/Tenant/ComboService');
const ProductRepository = require('../../../../repositories/Tenant/ProductRepository');
// Misma consulta de categorías que usa /promociones y /estaciones.
const EstacionRepository = require('../../../../repositories/Tenant/EstacionRepository');

class CombosController {
    // GET /combos
    static async index(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res
                    .status(403)
                    .render('errors/generic', { error: { message: 'Contexto de tenant no disponible' } });
            }
            const [combos, productos, categorias] = await Promise.all([
                ComboService.listar(tenantId),
                ProductRepository.findAll(tenantId),
                EstacionRepository.findCategoriasConEstacion(tenantId)
            ]);
            res.render('combos/index', {
                combos: combos || [],
                // Un combo no contiene otros combos.
                productos: (productos || []).filter(p => !p.es_combo),
                categorias: categorias || [],
                user: req.user,
                tenant: req.tenant
            });
        } catch (error) {
            console.error('Error al obtener combos:', error);
            res.status(500).render('errors/generic', { error: { message: 'Error al obtener combos' } });
        }
    }

    // GET /combos/:id
    static async show(req, res) {
        try {
            const detalle = await ComboService.getDetalle(Number.parseInt(req.params.id, 10), req.tenant?.id);
            res.json(detalle);
        } catch (error) {
            res.status(404).json({ error: error.message });
        }
    }

    // POST /combos
    static async store(req, res) {
        try {
            const result = await ComboService.crear(req.tenant?.id, req.body, req.user?.id || null);
            res.status(201).json(result);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    // PUT /combos/:id
    static async update(req, res) {
        try {
            const result = await ComboService.actualizar(
                Number.parseInt(req.params.id, 10),
                req.tenant?.id,
                req.body,
                req.user?.id || null
            );
            res.json(result);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    // DELETE /combos/:id
    static async destroy(req, res) {
        try {
            const result = await ComboService.eliminar(
                Number.parseInt(req.params.id, 10),
                req.tenant?.id,
                req.user?.id || null
            );
            res.json(result);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
}

module.exports = CombosController;
