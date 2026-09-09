const db = require('../../config/database');

class POSRepository {
    static async getProductosActivos(tenantId) {
        const [rows] = await db.query(
            `SELECT p.id, p.nombre, p.precio_unidad, p.codigo, p.es_favorito,
                    c.id AS categoria_id, c.nombre AS categoria_nombre
             FROM productos p
             LEFT JOIN categorias c ON p.categoria_id = c.id
             WHERE p.tenant_id = ? AND p.activo = 1
             ORDER BY p.es_favorito DESC, c.nombre, p.nombre`,
            [tenantId]
        );
        return rows;
    }

    static async getBorradores(tenantId, usuarioId) {
        const [rows] = await db.query(
            `SELECT id, cliente_id, nombre_cliente, items, total, notas, pedido_cocina_id, mesa_cocina_id, created_at
             FROM pos_borradores
             WHERE tenant_id = ? AND usuario_id = ?
             ORDER BY updated_at DESC`,
            [tenantId, usuarioId]
        );

        // El JSON de "items" es solo el snapshot del carrito al momento de guardar. Si
        // la orden ya tiene mesa virtual (pedido_cocina_id), lo que pasó ahí después
        // (productos agregados/editados desde Mesas) es la fuente de verdad -- se
        // reconstruye el carrito desde pedido_items en vez de confiar en el snapshot.
        const pedidoIds = rows.filter(r => r.pedido_cocina_id).map(r => r.pedido_cocina_id);
        const itemsVivosPorPedido = await POSRepository.getItemsVivosPorPedidos(tenantId, pedidoIds);

        return rows.map(r => {
            const tieneItemsVivos = r.pedido_cocina_id && itemsVivosPorPedido.has(r.pedido_cocina_id);
            const items = tieneItemsVivos
                ? itemsVivosPorPedido.get(r.pedido_cocina_id)
                : typeof r.items === 'string'
                  ? JSON.parse(r.items)
                  : r.items;
            const total = tieneItemsVivos
                ? items.reduce((sum, i) => {
                      const precioUnitario = (Number(i.precio) || 0) + (Number(i.modificadores_total) || 0);
                      return sum + i.cantidad * precioUnitario * (1 - (i.descuento_porcentaje || 0) / 100);
                  }, 0)
                : Number(r.total) || 0;
            return { ...r, items, total };
        });
    }

    /**
     * Reconstruye, para cada pedido de cocina dado, el carrito con formato POS (mismas
     * claves que arma pos_core.js) a partir de sus pedido_items/pedido_item_modificadores
     * en vivo. Excluye líneas ya pagadas individualmente o canceladas desde Mesas -- esas
     * ya no deben cobrarse de nuevo en el POS.
     * @returns {Promise<Map<number, Array>>} pedidoId -> items[]
     */
    static async getItemsVivosPorPedidos(tenantId, pedidoIds) {
        const porPedido = new Map(pedidoIds.map(id => [id, []]));
        if (pedidoIds.length === 0) {
            return porPedido;
        }

        const [items] = await db.query(
            `SELECT pi.id, pi.pedido_id, pi.producto_id, pi.servicio_id, pi.es_servicio, pi.cantidad,
                    pi.unidad_medida, pi.precio_unitario, pi.nota,
                    COALESCE(p.nombre, s.nombre) AS nombre, p.categoria_id
             FROM pedido_items pi
             LEFT JOIN productos p ON p.id = pi.producto_id
             LEFT JOIN servicios s ON s.id = pi.servicio_id
             WHERE pi.tenant_id = ? AND pi.pedido_id IN (?)
               AND pi.estado != 'cancelado' AND (pi.pagado = 0 OR pi.pagado IS NULL)
             ORDER BY pi.created_at ASC`,
            [tenantId, pedidoIds]
        );
        if (items.length === 0) {
            return porPedido;
        }

        const [mods] = await db.query(
            `SELECT m.pedido_item_id, m.opcion_modificador_id, m.grupo_nombre, m.opcion_nombre,
                    m.precio_adicional, m.cantidad, o.grupo_id
             FROM pedido_item_modificadores m
             LEFT JOIN opciones_modificador o ON o.id = m.opcion_modificador_id
             WHERE m.pedido_item_id IN (?)`,
            [items.map(i => i.id)]
        );
        const modsByItem = new Map();
        for (const m of mods) {
            if (!modsByItem.has(m.pedido_item_id)) {
                modsByItem.set(m.pedido_item_id, []);
            }
            modsByItem.get(m.pedido_item_id).push(m);
        }

        for (const it of items) {
            const modsItem = modsByItem.get(it.id) || [];
            const modificadoresTotal = modsItem.reduce((s, m) => s + Number(m.precio_adicional) * (m.cantidad || 1), 0);
            const precioBase = Number(it.precio_unitario) - modificadoresTotal;

            const seleccionPorGrupo = new Map();
            for (const m of modsItem) {
                if (!m.grupo_id) {
                    continue;
                }
                if (!seleccionPorGrupo.has(m.grupo_id)) {
                    seleccionPorGrupo.set(m.grupo_id, []);
                }
                seleccionPorGrupo.get(m.grupo_id).push(m.opcion_modificador_id);
            }

            const item = {
                producto_id: it.es_servicio ? null : it.producto_id,
                servicio_id: it.es_servicio ? it.servicio_id : undefined,
                es_servicio: !!it.es_servicio,
                nombre: it.nombre,
                precio: precioBase,
                precio_original: precioBase,
                cantidad: Number(it.cantidad),
                descuento_porcentaje: 0,
                categoria_id: it.categoria_id || null,
                unidad: it.unidad_medida || 'UND',
                nota: it.nota || null,
                modificadores_seleccion: [...seleccionPorGrupo.entries()].map(([grupo_id, opciones]) => ({
                    grupo_id,
                    opciones
                })),
                modificadores_preview: modsItem.map(m => ({
                    opcion_nombre: m.opcion_nombre,
                    precio_adicional: Number(m.precio_adicional)
                })),
                modificadores_total: modificadoresTotal,
                modificadores_hash:
                    modsItem
                        .map(m => m.opcion_modificador_id)
                        .filter(Boolean)
                        .sort((a, b) => a - b)
                        .join(',') || null
            };

            porPedido.get(it.pedido_id).push(item);
        }

        return porPedido;
    }

    static async createBorrador(
        tenantId,
        usuarioId,
        { cliente_id, nombre_cliente, items, total, notas, pedido_cocina_id, mesa_cocina_id }
    ) {
        const [result] = await db.query(
            `INSERT INTO pos_borradores (tenant_id, usuario_id, cliente_id, nombre_cliente, items, total, notas, pedido_cocina_id, mesa_cocina_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                tenantId,
                usuarioId,
                cliente_id || null,
                nombre_cliente || null,
                JSON.stringify(items),
                total || 0,
                notas || null,
                pedido_cocina_id || null,
                mesa_cocina_id || null
            ]
        );
        return result.insertId;
    }

    // Actualiza en el sitio una orden guardada ya existente (ver POSService.saveBorrador):
    // al "Cargar" un borrador para editarlo, ya NO se borra de inmediato (ver cargarBorrador
    // en pos_core.js) para no dejar la orden viviendo solo en memoria del navegador. Guardar
    // de nuevo actualiza esta misma fila en vez de crear una duplicada.
    static async updateBorrador(
        id,
        tenantId,
        { cliente_id, nombre_cliente, items, total, notas, pedido_cocina_id, mesa_cocina_id }
    ) {
        await db.query(
            `UPDATE pos_borradores
             SET cliente_id = ?, nombre_cliente = ?, items = ?, total = ?, notas = ?, pedido_cocina_id = ?, mesa_cocina_id = ?
             WHERE id = ? AND tenant_id = ?`,
            [
                cliente_id || null,
                nombre_cliente || null,
                JSON.stringify(items),
                total || 0,
                notas || null,
                pedido_cocina_id || null,
                mesa_cocina_id || null,
                id,
                tenantId
            ]
        );
    }

    static async deleteBorrador(id, tenantId) {
        const [rows] = await db.query(`SELECT pedido_cocina_id FROM pos_borradores WHERE id = ? AND tenant_id = ?`, [
            id,
            tenantId
        ]);
        if (rows.length === 0) {
            return null;
        }
        await db.query(`DELETE FROM pos_borradores WHERE id = ? AND tenant_id = ?`, [id, tenantId]);
        return { pedidoCocinaId: rows[0].pedido_cocina_id };
    }

    // Contraparte de deleteBorrador: cuando el pedido se cancela desde cocina (no desde
    // el POS), hay que borrar el borrador asociado para que el cajero no pueda "Cargar"
    // y cobrar una orden que cocina ya canceló.
    static async deleteBorradorPorPedidoCocina(pedidoCocinaId, tenantId) {
        await db.query(`DELETE FROM pos_borradores WHERE pedido_cocina_id = ? AND tenant_id = ?`, [
            pedidoCocinaId,
            tenantId
        ]);
    }

    static async getStatsHoy(tenantId) {
        const [rows] = await db.query(
            `SELECT COUNT(*) AS num_ordenes, COALESCE(SUM(total), 0) AS total_hoy
             FROM facturas
             WHERE tenant_id = ? AND fecha >= CURDATE() AND fecha < CURDATE() + INTERVAL 1 DAY`,
            [tenantId]
        );
        return rows[0] || { num_ordenes: 0, total_hoy: 0 };
    }

    static async findOrCreateCliente(tenantId, nombre) {
        const [existing] = await db.query(
            'SELECT id FROM clientes WHERE tenant_id = ? AND LOWER(nombre) = LOWER(?) LIMIT 1',
            [tenantId, nombre.trim()]
        );
        if (existing.length) {
            return existing[0].id;
        }
        const [result] = await db.query('INSERT INTO clientes (tenant_id, nombre) VALUES (?, ?)', [
            tenantId,
            nombre.trim()
        ]);
        return result.insertId;
    }

    /**
     * Inserta los pedido_items (+ modificadores) de una lista de productos ya resueltos
     * para un pedido de cocina, todos en estado 'enviado'. Compartido por enviarPedidoACocina
     * (primer envío) y resincronizarItemsPedido (reenvío tras corregir en el carrito del POS).
     * @returns {Promise<number>} Total sumado de las líneas insertadas
     */
    static async _insertarItemsPedido(conn, tenantId, pedidoId, itemsValidos) {
        let total = 0;
        for (const p of itemsValidos) {
            const cantidad = parseFloat(p.cantidad) || 1;
            const precio = parseFloat(p.precio) || 0;
            const subtotal = parseFloat(p.subtotal) || cantidad * precio;
            total += subtotal;

            const mods = p._modificadoresSnapshot || [];
            const modificadoresHash =
                mods.length > 0
                    ? mods
                          .map(m => m.opcion_modificador_id)
                          .slice()
                          .sort((a, b) => a - b)
                          .join(',')
                    : null;

            const [itemResult] = await conn.query(
                `INSERT INTO pedido_items (tenant_id, pedido_id, producto_id, cantidad, unidad_medida, precio_unitario, subtotal, estado, modificadores_hash, enviado_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'enviado', ?, NOW())`,
                [tenantId, pedidoId, p.producto_id, cantidad, p.unidad || 'UND', precio, subtotal, modificadoresHash]
            );

            if (mods.length > 0) {
                const modValues = mods.map(m => [
                    itemResult.insertId,
                    m.opcion_modificador_id,
                    m.grupo_nombre,
                    m.opcion_nombre,
                    m.precio_adicional,
                    m.cantidad || 1,
                    m.insumo_id || null,
                    m.cantidad_insumo || null,
                    m.unidad_insumo || null
                ]);
                await conn.query(
                    'INSERT INTO pedido_item_modificadores (pedido_item_id, opcion_modificador_id, grupo_nombre, opcion_nombre, precio_adicional, cantidad, insumo_id, cantidad_insumo, unidad_insumo) VALUES ?',
                    [modValues]
                );
            }
        }
        return total;
    }

    /**
     * Crea un pedido "de cocina" para una venta ya facturada del POS: una mesa virtual
     * dedicada (igual al patrón usado por WhatsAppService) + un pedido con origen='caja'
     * + sus pedido_items en estado 'enviado' (la venta ya está pagada, cocina debe
     * prepararla de inmediato). Se completa después desde CocinaRepository.completarPedidoPOS.
     */
    static async enviarPedidoACocina(tenantId, { productos, nombrePedido, clienteId }) {
        const itemsValidos = (productos || []).filter(p => !p.es_servicio && p.producto_id);
        if (itemsValidos.length === 0) {
            return null;
        }

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            // FOR UPDATE serializa contra otros envíos POS concurrentes del mismo tenant
            // mientras dure la transacción (ver AbrirPedidoService, mismo patrón).
            const [numResult] = await connection.query(
                `SELECT COALESCE(MAX(numero), 0) + 1 AS siguiente FROM pedidos WHERE tenant_id = ? AND DATE(created_at) = CURDATE() FOR UPDATE`,
                [tenantId]
            );
            const siguienteNumero = numResult[0].siguiente;
            const numeroMesa = `POS-${siguienteNumero}`;

            // numeroMesa se reinicia cada día, pero mesas.numero es único por tenant PARA
            // SIEMPRE y las mesas virtuales del POS nunca se borran, solo se liberan (ver
            // CocinaRepository.completarPedidoPOS/cancelarPedidoPOS) -- así que un "POS-2"
            // de hoy puede chocar con un "POS-2" ya liberado de un día anterior. En vez de
            // insertar a ciegas (causaba ER_DUP_ENTRY y el pedido nunca llegaba a cocina),
            // reutilizamos esa fila igual que WhatsAppService hace con sus mesas WA-XXXX.
            const [mesaResult] = await connection.query(
                `INSERT INTO mesas (tenant_id, numero, descripcion, tipo, estado)
                 VALUES (?, ?, ?, 'virtual', 'ocupada')
                 ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), descripcion = VALUES(descripcion), tipo = 'virtual', estado = 'ocupada'`,
                [tenantId, numeroMesa, nombrePedido || null]
            );
            const mesaId = mesaResult.insertId;

            const [pedidoResult] = await connection.query(
                `INSERT INTO pedidos (tenant_id, mesa_id, cliente_id, estado, total, notas, numero, origen)
                 VALUES (?, ?, ?, 'abierto', 0, ?, ?, 'caja')`,
                [tenantId, mesaId, clienteId || null, nombrePedido || null, siguienteNumero]
            );
            const pedidoId = pedidoResult.insertId;

            const total = await POSRepository._insertarItemsPedido(connection, tenantId, pedidoId, itemsValidos);
            await connection.query('UPDATE pedidos SET total = ? WHERE id = ?', [
                Math.round(total * 100) / 100,
                pedidoId
            ]);

            await connection.commit();
            return { pedidoId, mesaId };
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    }

    /**
     * Reemplaza los pedido_items de un pedido de cocina ya enviado con el contenido
     * actual del carrito del POS (ver POS.actualizarModificadoresCarrito / guardarOrden):
     * al corregir toppings/cantidades de una orden que ya está en cola de cocina, esto
     * "reenvía" la versión corregida -- todas las líneas quedan en estado 'enviado' de
     * nuevo, como si acabaran de llegar. ON DELETE CASCADE en pedido_item_modificadores
     * limpia los toppings de las líneas viejas junto con ellas.
     */
    static async resincronizarItemsPedido(tenantId, pedidoId, productos) {
        const itemsValidos = (productos || []).filter(p => !p.es_servicio && p.producto_id);
        if (itemsValidos.length === 0) {
            return null;
        }

        const [pedidos] = await db.query(`SELECT id FROM pedidos WHERE id = ? AND tenant_id = ? AND origen = 'caja'`, [
            pedidoId,
            tenantId
        ]);
        if (pedidos.length === 0) {
            return null;
        }

        await db.query('DELETE FROM pedido_items WHERE pedido_id = ?', [pedidoId]);
        const total = await POSRepository._insertarItemsPedido(db, tenantId, pedidoId, itemsValidos);
        await db.query('UPDATE pedidos SET total = ? WHERE id = ?', [Math.round(total * 100) / 100, pedidoId]);

        return { pedidoId };
    }
}

module.exports = POSRepository;
