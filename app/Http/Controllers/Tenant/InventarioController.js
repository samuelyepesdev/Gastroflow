const InventarioService = require('../../../../services/Tenant/InventarioService');
const InsumoService = require('../../../../services/Tenant/InsumoService');
const TemaRepository = require('../../../../repositories/Shared/TemaRepository');
const ParametroService = require('../../../../services/Shared/ParametroService');

class InventarioController {
    // GET /inventario
    static async index(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res
                    .status(403)
                    .render('errors/internal', { error: { message: 'Contexto de tenant no disponible' } });
            }

            const insumos = await InventarioService.listInsumos(tenantId, {});
            const resumen = await InventarioService.getResumenValorizacion(tenantId);

            const [temaCat, temaUni] = await Promise.all([
                TemaRepository.findByName('CATEGORIAS DE INSUMO', tenantId),
                TemaRepository.findByName('UNIDADES DE COMPRA', tenantId)
            ]);
            const ProveedorService = require('../../../../services/Tenant/ProveedorService');
            const proveedores = await ProveedorService.getAll(tenantId);

            let categoriasInsumo = [],
                unidadesCompra = [];
            if (temaCat) {
                categoriasInsumo = await ParametroService.getByTemaId(temaCat.id, tenantId);
            }
            if (temaUni) {
                unidadesCompra = await ParametroService.getByTemaId(temaUni.id, tenantId);
            }

            res.render('inventario/index', {
                user: req.user,
                tenant: req.tenant,
                insumos: insumos || [],
                resumen: resumen || {},
                allowedByPlan: res.locals.allowedByPlan || {},
                categoriasInsumo,
                unidadesCompra,
                proveedores: proveedores || []
            });
        } catch (e) {
            console.error('Error inventario:', e);
            res.status(500).render('errors/internal', { error: e });
        }
    }

    // GET /inventario/api/insumos
    static async listInsumos(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const list = await InventarioService.listInsumos(tenantId, { q: req.query.q });
            res.json(list);
        } catch (e) {
            res.status(500).json({ error: e.message || 'Error al listar' });
        }
    }

    // GET /inventario/api/resumen
    static async getResumen(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const resumen = await InventarioService.getResumenValorizacion(tenantId);
            res.json(resumen);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    // GET /inventario/api/lista-mercado
    static async getListaMercado(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const incluirCerca = req.query.incluir_cerca === '1' || req.query.incluir_cerca === 'true';
            const result = await InventarioService.getListaMercado(tenantId, incluirCerca);
            res.json(result);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    // GET /inventario/api/check-producto/:productoId
    static async checkStockProducto(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const cantidad = parseFloat(req.query.cantidad) || 1;
            const result = await InventarioService.checkStockParaProducto(tenantId, req.params.productoId, cantidad);
            res.json(result);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    // GET /inventario/api/movimientos
    static async getMovimientos(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const list = await InventarioService.getMovimientos(tenantId, {
                insumo_id: req.query.insumo_id,
                tipo: req.query.tipo
            });
            res.json(list);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    // POST /inventario/api/insumos
    static async storeInsumo(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const id = await InsumoService.create(tenantId, req.body);

            if (req.body.stock_inicial && parseFloat(req.body.stock_inicial) > 0) {
                const stock_inicial = parseFloat(req.body.stock_inicial);
                const cantidad_compra = parseFloat(req.body.cantidad_compra) || 1;
                const precio_compra = parseFloat(req.body.precio_compra) || 0;
                const costo_unitario = precio_compra / cantidad_compra || 0;

                await InventarioService.registrarEntrada(tenantId, {
                    insumo_id: id,
                    cantidad: stock_inicial,
                    costo_unitario: costo_unitario,
                    referencia: 'Stock inicial',
                    proveedor_id: req.body.proveedor_id || null,
                    usuario_id: req.user?.id || null
                });
            }

            res.status(201).json({ id });
        } catch (e) {
            res.status(400).json({ error: e.message || 'Error al crear' });
        }
    }

    // PUT /inventario/api/insumos/:id
    static async updateInsumo(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            await InsumoService.update(req.params.id, tenantId, req.body);
            res.json({ ok: true });
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    }

    // GET /inventario/api/insumos/:id
    static async getInsumo(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const item = await InsumoService.getById(req.params.id, tenantId);
            if (!item) {
                return res.status(404).json({ error: 'Insumo no encontrado' });
            }
            res.json(item);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    // DELETE /inventario/api/insumos/:id
    static async deleteInsumo(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            await InsumoService.delete(req.params.id, tenantId);
            res.json({ ok: true, message: 'Insumo eliminado exitosamente' });
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    }

    // POST /inventario/api/movimientos/entrada
    static async registrarEntrada(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const { insumo_id, cantidad, costo_unitario, referencia } = req.body;
            const result = await InventarioService.registrarEntrada(tenantId, {
                insumo_id,
                cantidad,
                costo_unitario,
                referencia,
                usuario_id: req.user?.id || null
            });
            res.status(201).json(result);
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    }

    // POST /inventario/api/movimientos/salida
    static async registrarSalida(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const { insumo_id, cantidad, referencia } = req.body;
            const result = await InventarioService.registrarSalida(tenantId, { insumo_id, cantidad, referencia });
            res.status(201).json(result);
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    }

    // POST /inventario/api/movimientos/ajuste
    static async registrarAjuste(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const { insumo_id, cantidad, referencia } = req.body;
            const result = await InventarioService.registrarAjuste(tenantId, { insumo_id, cantidad, referencia });
            res.status(201).json(result);
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    }
}

module.exports = InventarioController;
