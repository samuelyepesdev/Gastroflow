const POSService = require('../../../../services/Tenant/POSService');
const POSRepository = require('../../../../repositories/Tenant/POSRepository');
const FacturaService = require('../../../../services/Tenant/FacturaService');
const CajaService = require('../../../../services/Tenant/CajaService');
const ModificadorService = require('../../../../services/Tenant/ModificadorService');
const CocinaService = require('../../../../services/Tenant/CocinaService');
const AuthService = require('../../../../services/Shared/AuthService');
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
            const puedeUsarModificadores = AuthService.hasPermission(req.user?.permisos, 'modificadores.ver');
            const result = await POSService.saveBorrador(tenantId, usuarioId, req.body, puedeUsarModificadores);
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
            const skipCocina = req.query.skip_cocina === '1';
            const deleted = await POSService.deleteBorrador(id, tenantId, { skipCocina });
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
        } catch (err) {
            logger.error('POS getModificadoresProducto error', { err: err.message });
            res.status(500).json({ error: 'Error al obtener modificadores del producto' });
        }
    }

    static async vender(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const { nombre_cliente, forma_pago, productos, total, pedido_cocina_id, borrador_id, efectivo_recibido } =
                req.body;
            let { cliente_id } = req.body;

            const nombreLimpio = (nombre_cliente || '').trim();
            if (!cliente_id) {
                cliente_id = await POSService.findOrCreateCliente(tenantId, nombreLimpio || 'Consumidor final');
            } else if (
                nombreLimpio &&
                nombreLimpio.toLowerCase() !== 'consumidor final' &&
                AuthService.hasPermission(req.user?.permisos, 'pos.nombrar_cliente')
            ) {
                // Cuando la orden se guarda y se le pone un nombre (para identificarla en
                // cocina) y luego se carga de vuelta al carrito para cobrarla, cliente_id
                // sigue apuntando al cliente "Consumidor final" con el que arranca el
                // carrito por defecto -- el nombre puesto solo vive en nombre_cliente. Con
                // este permiso, ese nombre pasa a ser el cliente real de la factura; sin
                // él, se mantiene el comportamiento de siempre (queda como Consumidor final).
                cliente_id = await POSService.findOrCreateCliente(tenantId, nombreLimpio);
            }

            const puedeUsarModificadores = AuthService.hasPermission(req.user?.permisos, 'modificadores.ver');
            const result = await FacturaService.create(tenantId, {
                cliente_id,
                total,
                forma_pago,
                productos,
                usuario_id: req.user.id,
                puedeUsarModificadores,
                efectivo_recibido
            });

            // Si esta venta viene de una orden que ya se había guardado (y por lo tanto
            // ya se envió a cocina al hacer clic en "Guardar"), al cobrarla se completa
            // y sale de la cola — best-effort, no debe tumbar la respuesta de la venta.
            if (pedido_cocina_id) {
                try {
                    await CocinaService.completarPedidoPOS(parseInt(pedido_cocina_id), tenantId);
                } catch (cocinaErr) {
                    logger.warn('POS vender: no se pudo completar pedido de cocina', {
                        pedido_cocina_id,
                        err: cocinaErr.message
                    });
                }
            }

            // Si la venta viene de una orden guardada (cargada al carrito), ya se cobró:
            // ahora sí se borra el borrador. Antes se borraba al "Cargar", lo que dejaba
            // la orden viviendo solo en el carrito del navegador hasta cobrarla o
            // guardarla de nuevo -- si algo interrumpía al cajero en el medio (recargar
            // la página, cerrar la pestaña, "Limpiar" por error), la orden se perdía
            // por completo porque el registro en la BD ya no existía.
            if (borrador_id) {
                try {
                    await POSRepository.deleteBorrador(parseInt(borrador_id), tenantId);
                } catch (borradorErr) {
                    logger.warn('POS vender: no se pudo eliminar el borrador tras cobrar', {
                        borrador_id,
                        err: borradorErr.message
                    });
                }
            }

            res.status(201).json(result);
        } catch (err) {
            logger.warn('POS vender error', { err: err.message });
            res.status(400).json({ error: err.message });
        }
    }
}

module.exports = POSController;
