const db = require('../../config/database');
const MenuQRRepository = require('../../repositories/Public/MenuQRRepository');
const WhatsAppService = require('../Tenant/WhatsAppService');
const InventarioService = require('../Tenant/InventarioService'); // Para validación de stock
const ModificadorService = require('../Tenant/ModificadorService'); // Toppings/modificadores

class PedidoQRService {
    static async procesarPedido(qrToken, itemsInput, notasGlobales, clientIp, cookies = {}) {
        if (!itemsInput || !Array.isArray(itemsInput) || itemsInput.length === 0) {
            throw Object.assign(new Error('El pedido no contiene productos.'), { status: 400 });
        }

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            // 1. Encontrar y validar mesa y tenant
            const [mesas] = await connection.query(
                `SELECT m.id, m.tenant_id, m.numero, m.qr_session_id, m.last_qr_activity, t.activo 
                 FROM mesas m 
                 JOIN tenants t ON m.tenant_id = t.id 
                 WHERE m.qr_token = ? AND m.tipo = 'fisica'`, 
                [qrToken]
            );

            if (mesas.length === 0) {
                throw Object.assign(new Error('Código QR inválido o mesa no encontrada.'), { status: 404 });
            }
            
            const mesa = mesas[0];

            // VALIDACIÓN DE SEGURIDAD Y TIEMPO (Solución para expiración)
            const clientSession = cookies ? cookies[`qr_session_${mesa.id}`] : null;
            
            // Si la mesa tiene una sesión activa en DB, el cliente DEBE tener la misma en su cookie
            if (mesa.qr_session_id && clientSession !== mesa.qr_session_id) {
                throw Object.assign(new Error('Tu sesión ha expirado o el código QR ya no es válido para esta mesa. Por favor, escanea el código nuevamente.'), { status: 403 });
            }

            // Si han pasado más de 2 horas desde el primer escaneo/actividad y la mesa sigue ocupada, invalidar por tiempo
            if (mesa.last_qr_activity) {
                const diffHoras = (Date.now() - new Date(mesa.last_qr_activity).getTime()) / (1000 * 60 * 60);
                if (diffHoras > 2) {
                    // Limpiar sesión vieja para forzar re-escaneo
                    await connection.query('UPDATE mesas SET qr_session_id = NULL, last_qr_activity = NULL WHERE id = ?', [mesa.id]);
                    throw Object.assign(new Error('La sesión de esta mesa ha expirado por inactividad. Por favor, escanea el código nuevamente.'), { status: 403 });
                }
            }

            if (!mesa.activo) {
                throw Object.assign(new Error('El restaurante se encuentra inactivo actualmente.'), { status: 403 });
            }

            // Actualizar última actividad
            await connection.query('UPDATE mesas SET last_qr_activity = NOW() WHERE id = ?', [mesa.id]);

            const tenantId = mesa.tenant_id;
            const mesaId = mesa.id;

            // 2. Extraer IDs de productos únicos y validar existencias / precios reales
            const productoIds = [...new Set(itemsInput.map(i => Number(i.producto_id)))];
            const [productosDb] = await connection.query(
                `SELECT id, precio_unidad, nombre FROM productos WHERE id IN (?) AND tenant_id = ? AND activo = 1`,
                [productoIds, tenantId]
            );

            if (productosDb.length !== productoIds.length) {
                throw Object.assign(new Error('Algunos productos ya no están disponibles. Por favor, recarga el menú.'), { status: 400 });
            }

            const productosMap = new Map();
            productosDb.forEach(p => productosMap.set(Number(p.id), p));

            // 3. Buscar si hay pedido abierto en esa mesa
            const [existentes] = await connection.query(
                `SELECT id, total, numero FROM pedidos WHERE mesa_id = ? AND estado NOT IN ('cerrado','cancelado') LIMIT 1`,
                [mesaId]
            );

            let pedidoId;
            let pedidoNumero;
            let currentTotal = 0;

            if (existentes.length > 0) {
                pedidoId = existentes[0].id;
                pedidoNumero = existentes[0].numero;
                currentTotal = Number(existentes[0].total) || 0;
                
                // Opcional: si ya hay pedido abierto y envían notas desde el QR, podríamos agregarlas (appended) o ignorarlas.
                if (notasGlobales) {
                    await connection.query(
                        `UPDATE pedidos SET notas = CONCAT_WS('\\n', notas, ?) WHERE id = ?`,
                        [`[Nota QR]: ${notasGlobales}`, pedidoId]
                    );
                }
            } else {
                // Crear un nuevo pedido con origen='qr' (numeración reiniciada cada día)
                const [numResult] = await connection.query(
                    `SELECT COALESCE(MAX(numero), 0) + 1 AS siguiente FROM pedidos WHERE tenant_id = ? AND DATE(created_at) = CURDATE()`,
                    [tenantId]
                );
                const siguienteNumero = numResult[0].siguiente;
                pedidoNumero = siguienteNumero;

                const [insert] = await connection.query(
                    `INSERT INTO pedidos (tenant_id, mesa_id, estado, total, notas, numero, origen, sesion_cliente) 
                     VALUES (?, ?, 'abierto', 0, ?, ?, 'qr', ?)`,
                    [tenantId, mesaId, notasGlobales ? `[Nota QR]: ${notasGlobales}` : null, siguienteNumero, clientIp]
                );
                pedidoId = insert.insertId;

                await connection.query("UPDATE mesas SET estado = 'ocupada' WHERE id = ?", [mesaId]);
            }

            // 4. Insertar los items y acumular el nuevo total
            let totalItemsNuevos = 0;

            for (const item of itemsInput) {
                const prod = productosMap.get(Number(item.producto_id));
                const cantidad = parseFloat(item.cantidad);
                if (!prod || isNaN(cantidad) || cantidad <= 0) {continue;}

                // Nota por producto (opcional): el cliente puede escribir indicaciones para
                // cocina en cada línea desde el modal de personalización.
                const notaItem =
                    typeof item.nota === 'string' && item.nota.trim() ? item.nota.trim().slice(0, 255) : null;

                // Toppings/modificadores: el catálogo en BD es la fuente de verdad del precio
                // y de las reglas (obligatorio, mínimo/máximo). Nunca se confía en lo que
                // manda el cliente salvo los ids elegidos.
                let precioAdicionalTotal = 0;
                let lineasSnapshot = [];
                let modificadoresHash = null;
                try {
                    ({ precioAdicionalTotal, lineasSnapshot, modificadoresHash } =
                        await ModificadorService.validarYCalcularSeleccion(
                            tenantId,
                            prod.id,
                            item.modificadores || []
                        ));
                } catch (e) {
                    throw Object.assign(new Error(e.message || 'Selección de acompañamientos inválida.'), {
                        status: 400
                    });
                }

                // Validación de stock (Soft validation, registramos warning si no hay)
                const check = await InventarioService.checkStockParaProducto(tenantId, prod.id, cantidad);
                if (!check.ok) {
                    console.warn(`[Menu QR] Venta sin stock suficiente: Producto ID ${prod.id} en Tenant ${tenantId}`);
                }

                const precioUnitario = Number(prod.precio_unidad) + precioAdicionalTotal;
                const subtotal = cantidad * precioUnitario;
                totalItemsNuevos += subtotal;

                const [itemRes] = await connection.query(
                    `INSERT INTO pedido_items (tenant_id, pedido_id, producto_id, cantidad, unidad_medida, precio_unitario, subtotal, estado, nota, modificadores_hash)
                     VALUES (?, ?, ?, ?, 'UND', ?, ?, 'pendiente', ?, ?)`,
                    [tenantId, pedidoId, prod.id, cantidad, precioUnitario, subtotal, notaItem, modificadoresHash]
                );

                if (lineasSnapshot.length > 0) {
                    const pedidoItemId = itemRes.insertId;
                    const modificadoresValues = lineasSnapshot.map(m => [
                        pedidoItemId,
                        m.opcion_modificador_id,
                        m.grupo_nombre,
                        m.opcion_nombre,
                        m.precio_adicional,
                        m.cantidad || 1
                    ]);
                    await connection.query(
                        `INSERT INTO pedido_item_modificadores (pedido_item_id, opcion_modificador_id, grupo_nombre, opcion_nombre, precio_adicional, cantidad)
                         VALUES ?`,
                        [modificadoresValues]
                    );
                }
            }

            // 5. Actualizar el total del pedido
            const nuevoTotalGlobal = currentTotal + totalItemsNuevos;
            await connection.query('UPDATE pedidos SET total = ? WHERE id = ?', [nuevoTotalGlobal, pedidoId]);

            await connection.commit();

            // Emitir evento para notificaciones en tiempo real en el panel administrativo
            WhatsAppService.events.emit('orderCreated', { 
                tenantId, 
                pedidoId, 
                mesaId,
                origen: 'qr'
            });

            return { pedidoId, numero: pedidoNumero, nuevoTotalGlobal };

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Resuelve la mesa a partir del qr_token para operaciones de solo lectura o
     * acciones ligeras (consultar estado, llamar al mesero). No aplica la expiración
     * por inactividad de procesarPedido: solo dice si la cookie de sesión coincide.
     */
    static async _resolverMesaParaLectura(qrToken, cookies = {}) {
        if (!qrToken) {
            throw Object.assign(new Error('Falta el código QR.'), { status: 400 });
        }
        const [mesas] = await db.query(
            `SELECT m.id, m.tenant_id, m.numero, m.qr_session_id, t.activo
             FROM mesas m
             JOIN tenants t ON t.id = m.tenant_id
             WHERE m.qr_token = ? AND m.tipo = 'fisica'`,
            [qrToken]
        );
        if (mesas.length === 0) {
            throw Object.assign(new Error('Código QR inválido o mesa no encontrada.'), { status: 404 });
        }
        const mesa = mesas[0];
        if (!mesa.activo) {
            throw Object.assign(new Error('El restaurante se encuentra inactivo actualmente.'), { status: 403 });
        }
        const clientSession = cookies ? cookies[`qr_session_${mesa.id}`] : null;
        const sesionValida = !mesa.qr_session_id || clientSession === mesa.qr_session_id;
        return { mesa, sesionValida };
    }

    /**
     * Devuelve el pedido abierto de la mesa (si lo hay) con sus items y el estado de
     * cada uno, para que el cliente vea "cómo va" su pedido y el total acumulado.
     */
    static async getEstadoMesa(qrToken, cookies = {}) {
        const { mesa, sesionValida } = await this._resolverMesaParaLectura(qrToken, cookies);
        const vacio = { mesa: { numero: mesa.numero }, pedido: null, items: [], resumen: null };
        if (!sesionValida) {
            return vacio;
        }

        const [pedidos] = await db.query(
            `SELECT id, numero, total, estado
             FROM pedidos
             WHERE mesa_id = ? AND estado NOT IN ('cerrado', 'cancelado')
             ORDER BY id DESC LIMIT 1`,
            [mesa.id]
        );
        if (pedidos.length === 0) {
            return vacio;
        }
        const pedido = pedidos[0];

        const [items] = await db.query(
            `SELECT pi.id, pi.cantidad, pi.subtotal, pi.estado, pi.nota, p.nombre AS producto_nombre
             FROM pedido_items pi
             LEFT JOIN productos p ON p.id = pi.producto_id
             WHERE pi.pedido_id = ?
             ORDER BY pi.created_at ASC, pi.id ASC`,
            [pedido.id]
        );

        let modificadores = [];
        if (items.length > 0) {
            const itemIds = items.map(i => i.id);
            [modificadores] = await db.query(
                'SELECT pedido_item_id, opcion_nombre FROM pedido_item_modificadores WHERE pedido_item_id IN (?)',
                [itemIds]
            );
        }

        const resumen = { pendiente: 0, enviado: 0, preparando: 0, listo: 0, servido: 0, cancelado: 0 };
        const itemsOut = items.map(i => {
            if (resumen[i.estado] !== undefined) {
                resumen[i.estado] += 1;
            }
            return {
                producto_nombre: i.producto_nombre || 'Producto',
                cantidad: Number(i.cantidad),
                subtotal: Number(i.subtotal),
                estado: i.estado,
                nota: i.nota || null,
                modificadores: modificadores.filter(m => m.pedido_item_id === i.id).map(m => m.opcion_nombre)
            };
        });

        return {
            mesa: { numero: mesa.numero },
            pedido: { numero: pedido.numero, total: Number(pedido.total), estado: pedido.estado },
            items: itemsOut,
            resumen
        };
    }

    /**
     * El cliente llama al mesero o pide la cuenta desde el menú. Deja una traza en
     * las notas del pedido abierto (si existe) y emite un evento para el panel del
     * personal en tiempo real.
     */
    static async registrarSolicitud(qrToken, tipo, cookies = {}) {
        const textos = {
            mesero: 'El cliente solicita al mesero',
            cuenta: 'El cliente pide la cuenta'
        };
        if (!textos[tipo]) {
            throw Object.assign(new Error('Tipo de solicitud inválido.'), { status: 400 });
        }

        const { mesa, sesionValida } = await this._resolverMesaParaLectura(qrToken, cookies);
        if (!sesionValida) {
            throw Object.assign(
                new Error('Tu sesión ha expirado. Escanea el código nuevamente.'),
                { status: 403 }
            );
        }

        const [pedidos] = await db.query(
            `SELECT id FROM pedidos
             WHERE mesa_id = ? AND estado NOT IN ('cerrado', 'cancelado')
             ORDER BY id DESC LIMIT 1`,
            [mesa.id]
        );
        let pedidoId = null;
        if (pedidos.length > 0) {
            pedidoId = pedidos[0].id;
            const hora = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
            await db.query(
                `UPDATE pedidos SET notas = CONCAT_WS('\\n', notas, ?) WHERE id = ?`,
                [`[Solicitud QR ${hora}]: ${textos[tipo]}`, pedidoId]
            );
        }

        WhatsAppService.events.emit('mesaSolicitud', {
            tenantId: mesa.tenant_id,
            mesaId: mesa.id,
            mesaNumero: mesa.numero,
            pedidoId,
            tipo
        });

        return { ok: true };
    }
}

module.exports = PedidoQRService;
