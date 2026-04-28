const db = require('../../config/database');
const MenuQRRepository = require('../../repositories/Public/MenuQRRepository');
const InventarioService = require('../Tenant/InventarioService'); // Para validación de stock

class PedidoQRService {
    static async procesarPedido(qrToken, itemsInput, notasGlobales, clientIp) {
        if (!itemsInput || !Array.isArray(itemsInput) || itemsInput.length === 0) {
            throw { status: 400, message: 'El pedido no contiene productos.' };
        }

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            // 1. Encontrar y validar mesa y tenant (Bloqueamos las filas temporalmente para evitar race conditions si es posible, o validamos normal)
            const [mesas] = await connection.query(
                `SELECT m.id, m.tenant_id, m.numero, t.activo 
                 FROM mesas m 
                 JOIN tenants t ON m.tenant_id = t.id 
                 WHERE m.qr_token = ? AND m.tipo = 'fisica'`, 
                [qrToken]
            );

            if (mesas.length === 0) {
                throw { status: 404, message: 'Código QR inválido o mesa no encontrada.' };
            }
            
            const mesa = mesas[0];
            if (!mesa.activo) {
                throw { status: 403, message: 'El restaurante se encuentra inactivo actualmente.' };
            }

            const tenantId = mesa.tenant_id;
            const mesaId = mesa.id;

            // 2. Extraer IDs de productos únicos y validar existencias / precios reales
            const productoIds = [...new Set(itemsInput.map(i => Number(i.producto_id)))];
            const [productosDb] = await connection.query(
                `SELECT id, precio_unidad, nombre FROM productos WHERE id IN (?) AND tenant_id = ? AND activo = 1`,
                [productoIds, tenantId]
            );

            if (productosDb.length !== productoIds.length) {
                throw { status: 400, message: 'Algunos productos ya no están disponibles. Por favor, recarga el menú.' };
            }

            const productosMap = new Map();
            productosDb.forEach(p => productosMap.set(Number(p.id), p));

            // 3. Buscar si hay pedido abierto en esa mesa
            const [existentes] = await connection.query(
                `SELECT id, total FROM pedidos WHERE mesa_id = ? AND estado NOT IN ('cerrado','cancelado') LIMIT 1`,
                [mesaId]
            );

            let pedidoId;
            let currentTotal = 0;

            if (existentes.length > 0) {
                pedidoId = existentes[0].id;
                currentTotal = Number(existentes[0].total) || 0;
                
                // Opcional: si ya hay pedido abierto y envían notas desde el QR, podríamos agregarlas (appended) o ignorarlas.
                if (notasGlobales) {
                    await connection.query(
                        `UPDATE pedidos SET notas = CONCAT_WS('\\n', notas, ?) WHERE id = ?`,
                        [`[Nota QR]: ${notasGlobales}`, pedidoId]
                    );
                }
            } else {
                // Crear un nuevo pedido con origen='qr'
                const [numResult] = await connection.query(
                    `SELECT COALESCE(MAX(numero), 0) + 1 AS siguiente FROM pedidos WHERE tenant_id = ?`,
                    [tenantId]
                );
                const siguienteNumero = numResult[0].siguiente;

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
                if (isNaN(cantidad) || cantidad <= 0) continue;

                // Validación de stock (Soft validation, registramos warning si no hay)
                const check = await InventarioService.checkStockParaProducto(tenantId, prod.id, cantidad);
                if (!check.ok) {
                    console.warn(`[Menu QR] Venta sin stock suficiente: Producto ID ${prod.id} en Tenant ${tenantId}`);
                }

                const subtotal = cantidad * Number(prod.precio_unidad);
                totalItemsNuevos += subtotal;

                await connection.query(
                    `INSERT INTO pedido_items (tenant_id, pedido_id, producto_id, cantidad, unidad_medida, precio_unitario, subtotal, estado, nota)
                     VALUES (?, ?, ?, ?, 'UND', ?, ?, 'pendiente', NULL)`,
                    [tenantId, pedidoId, prod.id, cantidad, prod.precio_unidad, subtotal]
                );
            }

            // 5. Actualizar el total del pedido
            const nuevoTotalGlobal = currentTotal + totalItemsNuevos;
            await connection.query('UPDATE pedidos SET total = ? WHERE id = ?', [nuevoTotalGlobal, pedidoId]);

            await connection.commit();
            return { pedidoId, nuevoTotalGlobal };

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }
}

module.exports = PedidoQRService;
