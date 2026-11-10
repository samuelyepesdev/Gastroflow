const db = require('../../../../../config/database');
const CategoryService = require('../../../../../services/Admin/CategoryService');
const ProductRepository = require('../../../../../repositories/Tenant/ProductRepository');
const CajaService = require('../../../../../services/Tenant/CajaService');
const ModificadorService = require('../../../../../services/Tenant/ModificadorService');
const AuthService = require('../../../../../services/Shared/AuthService');
const PromocionService = require('../../../../../services/Tenant/PromocionService');

class MesaDashboardController {
    // GET /mesas
    static async index(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res
                    .status(403)
                    .render('errors/internal', { error: { message: 'Contexto de tenant no disponible' } });
            }

            const [mesasData] = await db.query(
                `
                SELECT m.*, (
                    SELECT COUNT(*) FROM pedidos p 
                    WHERE p.mesa_id = m.id AND p.estado IN ('abierto','en_cocina','preparando','listo','servido')
                ) AS pedidos_abiertos
                FROM mesas m
                WHERE m.tenant_id = ?
                ORDER BY m.tipo ASC, CAST(m.numero AS UNSIGNED), m.numero
            `,
                [tenantId]
            );

            const mesas = mesasData.filter(m => m.tipo === 'fisica');
            const mesasVirtuales = mesasData.filter(m => m.tipo === 'virtual' && m.estado !== 'libre');

            const categorias = await CategoryService.getAllActive(tenantId);
            const productosSinPromo = await ProductRepository.findAll(tenantId, { soloDisponibles: true });
            // Los favoritos de la grilla (fav-grid) se arman con esta misma lista, así
            // que necesitan la promo anotada igual que el buscador (/api/productos/buscar).
            const productos = await PromocionService.anotarProductos(tenantId, productosSinPromo, {
                precioKey: 'precio_unidad'
            });
            const avisoCajaCerrada = await CajaService.debeAvisarCajaCerrada(tenantId);

            res.render('mesas/index', {
                mesas: mesas || [],
                mesasVirtuales: mesasVirtuales || [],
                categorias: categorias || [],
                productos: productos || [],
                avisoCajaCerrada,
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
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }

            const [mesas] = await db.query(
                `
                SELECT m.*, (
                    SELECT COUNT(*) FROM pedidos p 
                    WHERE p.mesa_id = m.id AND p.estado IN ('abierto','en_cocina','preparando','listo','servido')
                ) AS pedidos_abiertos
                FROM mesas m
                WHERE m.tenant_id = ? AND (m.tipo = 'fisica' OR m.estado <> 'libre')
                ORDER BY m.tipo ASC, CAST(m.numero AS UNSIGNED), m.numero
            `,
                [tenantId]
            );
            res.json(mesas);
        } catch (error) {
            console.error('Error al listar mesas:', error);
            res.status(500).json({ error: 'Error al listar mesas' });
        }
    }

    // GET /mesas/productos/:id/modificadores
    static async getModificadoresProducto(req, res) {
        try {
            const tenantId = req.tenant?.id;
            // Si al usuario le quitaron el permiso de modificadores, no debe ver ni poder
            // elegir toppings al vender (aunque el producto sí los tenga configurados):
            // se responde como si el producto no tuviera grupos, sin abrir el modal.
            if (!AuthService.hasPermission(req.user?.permisos, 'modificadores.ver')) {
                return res.json([]);
            }
            const grupos = await ModificadorService.getGruposParaProducto(req.params.id, tenantId);
            res.json(grupos || []);
        } catch (error) {
            console.error('Error al obtener modificadores del producto:', error);
            res.status(500).json({ error: 'Error al obtener modificadores del producto' });
        }
    }
}

module.exports = MesaDashboardController;
