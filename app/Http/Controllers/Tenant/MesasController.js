const db = require('../../../../config/database');
const FacturaRepository = require('../../../../repositories/Tenant/FacturaRepository');
const InventarioService = require('../../../../services/Tenant/InventarioService');
const CategoryService = require('../../../../services/Admin/CategoryService');
const ProductRepository = require('../../../../repositories/Tenant/ProductRepository');
const CrearMesasMasivasService = require('../../../../services/Tenant/Mesas/CrearMesasMasivasService');
const AbrirPedidoService = require('../../../../services/Tenant/Mesas/AbrirPedidoService');
const FacturarPedidoService = require('../../../../services/Tenant/Mesas/FacturarPedidoService');
const MoverPedidoService = require('../../../../services/Tenant/Mesas/MoverPedidoService');
const MoverItemsService = require('../../../../services/Tenant/Mesas/MoverItemsService');
const LiberarMesaService = require('../../../../services/Tenant/Mesas/LiberarMesaService');
const AgregarItemService = require('../../../../services/Tenant/Mesas/AgregarItemService');
const AgregarServicioService = require('../../../../services/Tenant/Mesas/AgregarServicioService');
const EliminarItemService = require('../../../../services/Tenant/Mesas/EliminarItemService');
const LimpiarPedidoService = require('../../../../services/Tenant/Mesas/LimpiarPedidoService');
class MesasController {
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

            // Cargar categorías y productos para el apartado de favoritos (solo activos)
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
            console.error('Error al cargar mesas:', error);
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

    // POST /mesas/qrs/generar
    static async generarTokensQR(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            
            const crypto = require('crypto');
            const [mesasSinToken] = await db.query('SELECT id FROM mesas WHERE tenant_id = ? AND qr_token IS NULL', [tenantId]);
            
            let generados = 0;
            for (const mesa of mesasSinToken) {
                const randomString = crypto.randomBytes(8).toString('hex');
                const token = `t${tenantId}-m${mesa.id}-${randomString}`;
                await db.query('UPDATE mesas SET qr_token = ? WHERE id = ?', [token, mesa.id]);
                generados++;
            }
            
            res.json({ message: `Se generaron tokens QR para ${generados} mesas`, generados });
        } catch (error) {
            console.error('Error al generar tokens QR:', error);
            res.status(500).json({ error: 'Error interno al generar tokens QR' });
        }
    }

    // GET /mesas/qrs/imprimir
    static async imprimirQRs(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) return res.status(403).render('errors/internal', { error: { message: 'Contexto de tenant no disponible' } });

            // Solo mesas físicas (las virtuales no tienen QR pegado)
            const [mesas] = await db.query(`
                SELECT id, numero, descripcion, qr_token 
                FROM mesas 
                WHERE tenant_id = ? AND tipo = 'fisica' 
                ORDER BY CAST(numero AS UNSIGNED), numero
            `, [tenantId]);

            // Determinar la URL base pública
            const baseUrl = req.protocol + '://' + req.get('host');

            res.render('mesas/qrs', {
                mesas,
                baseUrl,
                user: req.user,
                tenant: req.tenant
            });
        } catch (error) {
            console.error('Error al cargar vista de impresión de QRs:', error);
            res.status(500).render('errors/internal', {
                error: { message: 'Error al cargar QRs', stack: error.stack }
            });
        }
    }

    // POST /mesas/crear
    static async store(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) return res.status(403).json({ error: 'Contexto de tenant no disponible' });

            const { numero, descripcion } = req.body || {};
            if (!numero) return res.status(400).json({ error: 'El número de mesa es requerido' });
            if (!descripcion || !String(descripcion).trim()) return res.status(400).json({ error: 'La descripción es requerida (ej: Terraza, Interior)' });
            const [result] = await db.query(
                'INSERT INTO mesas (tenant_id, numero, descripcion, estado) VALUES (?, ?, ?, ?)',
                [tenantId, String(numero), String(descripcion).trim(), 'libre']
            );
            res.status(201).json({ id: result.insertId });
        } catch (error) {
            console.error('Error al crear mesa:', error);
            if (error.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ error: 'Ya existe una mesa con ese número' });
            }
            res.status(500).json({ error: 'Error al crear mesa' });
        }
    }

    // PUT /mesas/:mesaId
    static async update(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            const mesaId = req.params.mesaId;
            const { numero, descripcion } = req.body || {};
            const [rows] = await db.query('SELECT id FROM mesas WHERE id = ? AND tenant_id = ?', [mesaId, tenantId]);
            if (rows.length === 0) return res.status(404).json({ error: 'Mesa no encontrada' });
            if (numero != null && String(numero).trim() === '') return res.status(400).json({ error: 'El número de mesa es requerido' });
            if (descripcion != null && String(descripcion).trim() === '') return res.status(400).json({ error: 'La descripción es requerida' });
            const updates = [];
            const values = [];
            if (numero !== undefined) { updates.push('numero = ?'); values.push(String(numero).trim()); }
            if (descripcion !== undefined) { updates.push('descripcion = ?'); values.push(String(descripcion).trim()); }
            if (updates.length === 0) return res.status(400).json({ error: 'Indique numero o descripcion a actualizar' });
            values.push(mesaId, tenantId);
            await db.query(`UPDATE mesas SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`, values);
            res.json({ message: 'Mesa actualizada' });
        } catch (error) {
            console.error('Error al actualizar mesa:', error);
            if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Ya existe una mesa con ese número' });
            res.status(500).json({ error: 'Error al actualizar mesa' });
        }
    }

    // POST /mesas/crear-masivas
    static async storeMasivas(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) return res.status(403).json({ error: 'Contexto de tenant no disponible' });

            const { cantidad, prefijo } = req.body || {};

            // 🌟 Delegar la responsabilidad compleja de matrices al Action / Service
            const resultado = await CrearMesasMasivasService.execute({ tenantId, cantidad, prefijo });

            return res.status(201).json(resultado);

        } catch (error) {
            console.error('Error al crear mesas masivas:', error.message);
            if (error.message === 'La cantidad debe estar entre 1 y 100') {
                return res.status(400).json({ error: error.message });
            }
            return res.status(500).json({ error: 'Error interno al crear mesas masivas' });
        }
    }

    // POST /mesas/abrir
    static async abrirPedido(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) return res.status(403).json({ error: 'Contexto de tenant no disponible' });

            const { mesa_id, cliente_id, notas } = req.body || {};
            if (!mesa_id) return res.status(400).json({ error: 'El ID de la mesa es requerido' });

            // 🌟 1. Delegamos las transacciones al ACTION. (SRP / MVC correcto)
            const pedido = await AbrirPedidoService.execute({
                tenantId,
                mesa_id,
                cliente_id,
                notas
            });

            // 🌐 2. El controlador solo retorna la respuesta HTTP final.
            return res.status(201).json({ pedido });

        } catch (error) {
            console.error('Error al abrir pedido:', error.message);
            // 🐛 3. Manejo de Errores controlado por la nomenclatura del Servicio
            if (error.message === 'Mesa no encontrada') {
                return res.status(404).json({ error: error.message });
            }
            return res.status(500).json({ error: 'Fallo interno al intentar abrir el pedido en base de datos' });
        }
    }

    // GET /mesas/pedidos/:pedidoId
    static async getPedido(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) return res.status(403).json({ error: 'Contexto de tenant no disponible' });

            const pedidoId = req.params.pedidoId;
            const [pedidos] = await db.query(`
                SELECT p.*, c.nombre AS cliente_nombre 
                FROM pedidos p 
                LEFT JOIN clientes c ON c.id = p.cliente_id 
                WHERE p.id = ? AND p.tenant_id = ?`,
                [pedidoId, tenantId]);

            if (pedidos.length === 0) return res.status(404).json({ error: 'Pedido no encontrado' });
            const pedido = pedidos[0];
            const [items] = await db.query(`
                SELECT i.*, 
                       COALESCE(p.nombre, s.nombre) AS producto_nombre 
                FROM pedido_items i
                LEFT JOIN productos p ON p.id = i.producto_id
                LEFT JOIN servicios s ON s.id = i.servicio_id
                WHERE i.pedido_id = ?
                ORDER BY i.created_at ASC
            `, [pedidoId]);
            res.json({ pedido, items });
        } catch (error) {
            console.error('Error al obtener pedido:', error);
            res.status(500).json({ error: 'Error al obtener pedido' });
        }
    }

    // PATCH /mesas/pedidos/:pedidoId/propina
    static async updatePropina(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            const pedidoId = req.params.pedidoId;
            const propina = Math.max(0, parseFloat(req.body?.propina) || 0);
            const [result] = await db.query(
                'UPDATE pedidos SET propina = ? WHERE id = ? AND tenant_id = ?',
                [propina, pedidoId, tenantId]
            );
            if (result.affectedRows === 0) return res.status(404).json({ error: 'Pedido no encontrado' });
            res.json({ propina });
        } catch (error) {
            console.error('Error al actualizar propina:', error);
            res.status(500).json({ error: 'Error al actualizar propina' });
        }
    }

    // PUT /mesas/items/:itemId/cantidad
    static async updateItemCantidad(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) return res.status(403).json({ error: 'Contexto de tenant no disponible' });

            const itemId = req.params.itemId;
            const { cantidad } = req.body || {};
            const cant = parseFloat(cantidad);
            if (cant == null || isNaN(cant) || cant < 0.01) {
                return res.status(400).json({ error: 'cantidad inválida (mínimo 0.01)' });
            }

            // Helper logic inside controller for now
            const [checkRows] = await db.query(
                'SELECT pi.id, pi.precio_unitario FROM pedido_items pi INNER JOIN pedidos p ON pi.pedido_id = p.id WHERE pi.id = ? AND p.tenant_id = ?',
                [itemId, tenantId]
            );
            if (checkRows.length === 0) return res.status(404).json({ error: 'Item no encontrado' });

            const precio = Number(checkRows[0].precio_unitario);
            const subtotal = (cant * precio).toFixed(2);
            await db.query(
                'UPDATE pedido_items SET cantidad = ?, subtotal = ? WHERE id = ?',
                [cant, subtotal, itemId]
            );
            res.json({ message: 'Cantidad actualizada', subtotal: parseFloat(subtotal) });
        } catch (error) {
            console.error('Error al actualizar cantidad:', error);
            res.status(500).json({ error: 'Error al actualizar cantidad' });
        }
    }

    // POST /mesas/pedidos/:pedidoId/items
    static async addItem(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) return res.status(403).json({ error: 'Contexto de tenant no disponible' });

            const pedidoId = req.params.pedidoId;
            const { producto_id, cantidad, unidad, precio, nota } = req.body || {};
            
            const resultado = await AgregarItemService.execute({ 
                tenantId, pedidoId, producto_id, cantidad, unidad, precio, nota 
            });
            return res.status(201).json(resultado);

        } catch (error) {
            console.error('Error al agregar item:', error.message);
            if (error.message === 'Pedido no encontrado') {
                return res.status(404).json({ error: error.message });
            }
            return res.status(400).json({ error: error.message || 'Error al agregar item' });
        }
    }

    // POST /mesas/pedidos/:pedidoId/servicios
    static async addService(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) return res.status(403).json({ error: 'Contexto de tenant no disponible' });

            const pedidoId = req.params.pedidoId;
            const { servicio_id, cantidad, precio, nota } = req.body || {};
            
            const resultado = await AgregarServicioService.execute({ 
                tenantId, pedidoId, servicio_id, cantidad, precio, nota 
            });
            return res.status(201).json(resultado);

        } catch (error) {
            console.error('Error al agregar servicio:', error.message);
            if (error.message === 'Pedido no encontrado') {
                return res.status(404).json({ error: error.message });
            }
            return res.status(400).json({ error: error.message || 'Error al agregar servicio' });
        }
    }

    // DELETE /mesas/items/:itemId
    static async destroyItem(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) return res.status(403).json({ error: 'Contexto de tenant no disponible' });

            const itemId = req.params.itemId;
            const resultado = await EliminarItemService.execute({ tenantId, itemId });

            return res.json(resultado);
        } catch (error) {
            console.error('Error al eliminar item:', error.message);
            if (error.message === 'Item no encontrado') {
                return res.status(404).json({ error: error.message });
            }
            return res.status(500).json({ error: 'Error interno al eliminar item' });
        }
    }

    // PUT /mesas/items/:itemId/enviar
    static async enviarItem(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) return res.status(403).json({ error: 'Contexto de tenant no disponible' });

            const itemId = req.params.itemId;
            const [rows] = await db.query(
                'SELECT pi.id FROM pedido_items pi INNER JOIN pedidos p ON pi.pedido_id = p.id WHERE pi.id = ? AND p.tenant_id = ?',
                [itemId, tenantId]
            );
            if (rows.length === 0) return res.status(404).json({ error: 'Item no encontrado' });

            await db.query(
                `UPDATE pedido_items SET estado = 'enviado', enviado_at = NOW() WHERE id = ?`,
                [itemId]
            );
            res.json({ message: 'Item enviado a cocina' });
        } catch (error) {
            console.error('Error al enviar item:', error);
            res.status(500).json({ error: 'Error al enviar item' });
        }
    }

    // PUT /mesas/items/:itemId/estado
    static async updateItemEstado(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) return res.status(403).json({ error: 'Contexto de tenant no disponible' });

            const itemId = req.params.itemId;
            const [rows] = await db.query(
                'SELECT pi.id FROM pedido_items pi INNER JOIN pedidos p ON pi.pedido_id = p.id WHERE pi.id = ? AND p.tenant_id = ?',
                [itemId, tenantId]
            );
            if (rows.length === 0) return res.status(404).json({ error: 'Item no encontrado' });

            const { estado } = req.body || {};
            const permitidos = ['pendiente', 'enviado', 'preparando', 'listo', 'servido', 'cancelado'];
            if (!permitidos.includes(estado)) return res.status(400).json({ error: 'Estado inválido' });

            let timestampField = null;
            if (estado === 'preparando') timestampField = 'preparado_at';
            if (estado === 'listo') timestampField = 'listo_at';
            if (estado === 'servido') timestampField = 'servido_at';

            if (timestampField) {
                await db.query(
                    `UPDATE pedido_items SET estado = ?, ${timestampField} = NOW() WHERE id = ?`,
                    [estado, itemId]
                );
            } else {
                await db.query(`UPDATE pedido_items SET estado = ? WHERE id = ?`, [estado, itemId]);
            }

            res.json({ message: 'Estado actualizado' });
        } catch (error) {
            console.error('Error al actualizar estado de item:', error);
            res.status(500).json({ error: 'Error al actualizar estado' });
        }
    }

    // PUT /mesas/items/:itemId/pagar
    static async pagarItem(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) return res.status(403).json({ error: 'Contexto de tenant no disponible' });

            const itemId = req.params.itemId;
            const { forma_pago } = req.body || {};
            
            if (!forma_pago || !['efectivo', 'transferencia'].includes(forma_pago)) {
                return res.status(400).json({ error: 'forma_pago requerida y debe ser efectivo o transferencia' });
            }

            const [rows] = await db.query(
                'SELECT pi.id FROM pedido_items pi INNER JOIN pedidos p ON pi.pedido_id = p.id WHERE pi.id = ? AND p.tenant_id = ?',
                [itemId, tenantId]
            );
            if (rows.length === 0) return res.status(404).json({ error: 'Item no encontrado' });

            await db.query(
                `UPDATE pedido_items SET pagado = 1, forma_pago = ? WHERE id = ?`,
                [forma_pago, itemId]
            );

            res.json({ message: 'Item pagado correctamente' });
        } catch (error) {
            console.error('Error al pagar item individual:', error);
            res.status(500).json({ error: 'Error al pagar item individual' });
        }
    }

    // POST /mesas/pedidos/:pedidoId/facturar
    static async facturarPedido(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) return res.status(403).json({ error: 'Contexto de tenant no disponible' });

            const pedidoId = req.params.pedidoId;
            const { cliente_id, forma_pago, descuentos, propina: propinaBody } = req.body || {};
            
            if (!cliente_id) return res.status(400).json({ error: 'El ID de cliente es requerido para facturar' });
            if (!forma_pago) return res.status(400).json({ error: 'La forma de pago es requerida' });
            
            const descuentosMap = descuentos && typeof descuentos === 'object' ? descuentos : {};

            // 🌟 1. Delegar todo el SQL y Cálculos pesados (SRP)
            const resultado = await FacturarPedidoService.execute({
                tenantId,
                pedidoId,
                cliente_id,
                forma_pago,
                descuentosMap,
                propinaBody
            });

            // 🌐 2. Devolver JSON Bonito
            return res.status(201).json(resultado);

        } catch (error) {
            console.error('Error en facturación desde pedido:', error.message);
            if (error.message === 'Pedido no encontrado' || error.message === 'Pedido sin items') {
                return res.status(404).json({ error: error.message });
            }
            return res.status(500).json({ error: error.message || 'Error al facturar pedido' });
        }
    }

    // PUT /mesas/pedidos/:pedidoId/mover
    static async moverPedido(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) return res.status(403).json({ error: 'Contexto de tenant no disponible' });

            const pedidoId = req.params.pedidoId;
            const { mesa_destino_id } = req.body || {};
            if (!mesa_destino_id) return res.status(400).json({ error: 'mesa_destino_id requerido' });

            const resultado = await MoverPedidoService.execute({ tenantId, pedidoId, mesa_destino_id });
            return res.json(resultado);

        } catch (error) {
            console.error('Error al mover pedido:', error.message);
            return res.status(400).json({ error: error.message || 'Error al mover pedido' });
        }
    }

    // POST /mesas/pedidos/:pedidoId/mover-items
    static async moverItems(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) return res.status(403).json({ error: 'Contexto de tenant no disponible' });

            const pedidoOrigenId = req.params.pedidoId;
            const { itemIds, mesa_destino_id } = req.body || {};

            const resultado = await MoverItemsService.execute({ tenantId, pedidoOrigenId, itemIds, mesa_destino_id });
            return res.json(resultado);

        } catch (error) {
            console.error('Error al mover productos:', error.message);
            return res.status(400).json({ error: error.message || 'Error al mover productos' });
        }
    }

    // PUT /mesas/:mesaId/liberar
    static async liberarMesa(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) return res.status(403).json({ error: 'Contexto de tenant no disponible' });

            const mesaId = req.params.mesaId;

            const resultado = await LiberarMesaService.execute({ tenantId, mesaId });
            return res.json(resultado);

        } catch (error) {
            console.error('Error al liberar mesa:', error.message);
            return res.status(400).json({ error: error.message || 'Error al liberar mesa' });
        }
    }

    // PUT /pedidos/:pedidoId/cliente
    static async updatePedidoCliente(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) return res.status(403).json({ error: 'Contexto de tenant no disponible' });

            const pedidoId = req.params.pedidoId;
            const { cliente_id } = req.body;

            let clienteAsociado = null;
            if (cliente_id !== null && cliente_id !== undefined) {
                const [rows] = await db.query('SELECT id, nombre FROM clientes WHERE id = ? AND tenant_id = ?', [cliente_id, tenantId]);
                if (rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
                clienteAsociado = rows[0];
            }

            const [result] = await db.query(
                'UPDATE pedidos SET cliente_id = ? WHERE id = ? AND tenant_id = ?',
                [cliente_id, pedidoId, tenantId]
            );

            if (result.affectedRows === 0) return res.status(404).json({ error: 'Pedido no encontrado' });
            res.json({ message: 'Cliente asociado al pedido', cliente: clienteAsociado });
        } catch (error) {
            console.error('Error al asociar cliente al pedido:', error);
            res.status(500).json({ error: 'Error al asociar cliente' });
        }
    }

    // DELETE /mesas/:mesaId
    static async destroy(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) return res.status(403).json({ error: 'Contexto de tenant no disponible' });

            const mesaId = req.params.mesaId;

            // Verificar si la mesa tiene pedidos activos
            const [pedidos] = await db.query(
                `SELECT id FROM pedidos WHERE mesa_id = ? AND estado NOT IN ('cerrado', 'cancelado') LIMIT 1`,
                [mesaId]
            );

            if (pedidos.length > 0) {
                return res.status(400).json({ error: 'No se puede eliminar la mesa porque tiene un pedido activo.' });
            }

            const [result] = await db.query(
                'DELETE FROM mesas WHERE id = ? AND tenant_id = ?',
                [mesaId, tenantId]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'Mesa no encontrada' });
            }

            res.json({ success: true, message: 'Mesa eliminada correctamente.' });
        } catch (error) {
            console.error('Error al eliminar mesa:', error);
            res.status(500).json({ error: 'Error al eliminar la mesa' });
        }
    }

    // DELETE /mesas/pedidos/:pedidoId/limpiar
    static async limpiarPedido(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const { pedidoId } = req.params;
            if (!tenantId) return res.status(403).json({ error: 'Contexto de tenant no disponible' });

            const result = await LimpiarPedidoService.execute({ tenantId, pedidoId });
            res.json(result);
        } catch (error) {
            console.error('Error al limpiar pedido:', error);
            res.status(500).json({ error: error.message || 'Error al limpiar pedido' });
        }
    }
}

module.exports = MesasController;
