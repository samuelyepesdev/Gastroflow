const db = require('../../../../config/database');
const CategoryService = require('../../../../services/Admin/CategoryService');
const ProductRepository = require('../../../../repositories/Tenant/ProductRepository');

class MesaDashboardController {
    // GET /mesas
    static async index(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) return res.status(403).render('errors/internal', { error: { message: 'Contexto de tenant no disponible' } });

            const [mesasData] = await db.query(`
                SELECT m.*, (
                    SELECT COUNT(*) FROM pedidos p 
                    WHERE p.mesa_id = m.id AND p.estado NOT IN ('cerrado','cancelado')
                ) AS pedidos_abiertos
                FROM mesas m
                WHERE m.tenant_id = ?
                ORDER BY m.tipo ASC, CAST(m.numero AS UNSIGNED), m.numero
            `, [tenantId]);

            const mesas = mesasData.filter(m => m.tipo === 'fisica');
            const mesasVirtuales = mesasData.filter(m => m.tipo === 'virtual' && m.estado !== 'libre');

            const categorias = await CategoryService.getAllActive(tenantId);
            const productos = await ProductRepository.findAll(tenantId);

            res.render('mesas/index', {
                mesas: mesas || [],
                mesasVirtuales: mesasVirtuales || [],
                categorias: categorias || [],
                productos: productos || [],
                user: req.user,
                tenant: req.tenant
            });
        } catch (error) {
            console.error('Error al cargar dashboard de mesas:', error);
            res.status(500).render('errors/internal', {
                error: { message: 'Error al cargar mesas', stack: error.stack }
            });
        }
    }

    // GET /mesas/listar
    static async list(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) return res.status(403).json({ error: 'Contexto de tenant no disponible' });

            const [mesas] = await db.query(`
                SELECT m.*, (
                    SELECT COUNT(*) FROM pedidos p 
                    WHERE p.mesa_id = m.id AND p.estado NOT IN ('cerrado','cancelado')
                ) AS pedidos_abiertos
                FROM mesas m
                WHERE m.tenant_id = ? AND (m.tipo = 'fisica' OR m.estado <> 'libre')
                ORDER BY m.tipo ASC, CAST(m.numero AS UNSIGNED), m.numero
            `, [tenantId]);
            res.json(mesas);
        } catch (error) {
            console.error('Error al listar mesas:', error);
            res.status(500).json({ error: 'Error al listar mesas' });
        }
    }
}

module.exports = MesaDashboardController;
