const ModificadorService = require('../../../../services/Tenant/ModificadorService');
const ProductService = require('../../../../services/Tenant/ProductService');
const InventarioService = require('../../../../services/Tenant/InventarioService');

class ModificadoresController {
    // GET /modificadores
    static async index(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res
                    .status(403)
                    .render('errors/internal', { error: { message: 'Contexto de tenant no disponible' } });
            }
            const grupos = await ModificadorService.listGrupos(tenantId);
            const { productos } = await ProductService.getAllForView(tenantId);
            const insumos = await InventarioService.listInsumos(tenantId, {});
            res.render('modificadores/index', {
                user: req.user,
                tenant: req.tenant,
                grupos: grupos || [],
                productos: productos || [],
                insumos: (insumos || []).map(i => ({
                    id: i.id,
                    nombre: i.nombre,
                    unidad_base: i.unidad_base || 'g'
                })),
                allowedByPlan: res.locals.allowedByPlan || {}
            });
        } catch (e) {
            console.error('Error modificadores:', e);
            res.status(500).render('errors/internal', { error: e });
        }
    }

    // GET /modificadores/api/grupos
    static async list(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const grupos = await ModificadorService.listGrupos(tenantId, req.query);
            res.json(grupos || []);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    // GET /modificadores/api/grupos/:id
    static async show(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const grupo = await ModificadorService.getGrupo(req.params.id, tenantId);
            if (!grupo) {
                return res.status(404).json({ error: 'Grupo no encontrado' });
            }
            res.json(grupo);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    // POST /modificadores/api/grupos
    static async store(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const id = await ModificadorService.createGrupo(tenantId, req.body);
            res.status(201).json({ id });
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    }

    // PUT /modificadores/api/grupos/:id
    static async update(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const result = await ModificadorService.updateGrupo(req.params.id, tenantId, req.body);
            res.json(result);
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    }

    // DELETE /modificadores/api/grupos/:id
    static async destroy(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const result = await ModificadorService.deleteGrupo(req.params.id, tenantId);
            res.json(result);
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    }

    // GET /modificadores/api/productos
    static async listProductos(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const { productos } = await ProductService.getAllForView(tenantId);
            res.json(productos || []);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    // GET /modificadores/api/insumos
    static async listInsumos(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const list = await InventarioService.listInsumos(tenantId, {});
            res.json(list || []);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    // GET /modificadores/api/productos/:productoId/grupos
    static async getGruposDeProducto(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const grupoIds = await ModificadorService.getGruposDeProducto(req.params.productoId, tenantId);
            res.json(grupoIds);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    // PUT /modificadores/api/productos/:productoId/grupos
    static async setGruposDeProducto(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const result = await ModificadorService.setGruposDeProducto(
                req.params.productoId,
                tenantId,
                req.body.grupo_ids
            );
            res.json(result);
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    }
}

module.exports = ModificadoresController;
