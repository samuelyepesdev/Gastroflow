const db = require('../../../config/database');
const InventarioService = require('../InventarioService');

class AgregarItemService {
    static async execute({ tenantId, pedidoId, producto_id, cantidad, unidad, precio, nota }) {
        if (!producto_id || cantidad === null || cantidad === undefined || precio === null || precio === undefined) {
            throw new Error('producto_id, cantidad y precio son requeridos');
        }

        let realProductId = producto_id;

        // 🏺 Lógica para Insumos de Cerámica (Insumos Virtuales)
        // Si el ID es >= 1.000.000, es un insumo que queremos vender directamente
        if (producto_id >= 1000000) {
            const insumoId = producto_id - 1000000;
            realProductId = await this._getOrCreateMirrorProduct(tenantId, insumoId, precio);
        }

        const [pedidos] = await db.query('SELECT id, mesa_id FROM pedidos WHERE id = ? AND tenant_id = ?', [
            pedidoId,
            tenantId
        ]);
        if (pedidos.length === 0) {
            throw new Error('Pedido no encontrado');
        }
        const pedidoRow = pedidos[0];

        const check = await InventarioService.checkStockParaProducto(
            tenantId,
            realProductId,
            parseFloat(cantidad) || 1
        );
        if (!check.ok) {
            const msg = (check.faltantes || [])
                .map(f => `${f.insumo_nombre}: requiere ${f.requerido} ${f.unidad_base}, disponible ${f.disponible}`)
                .join('; ');
            // eslint-disable-next-line no-console
            console.warn('[Inventario] Vendiendo sin stock suficiente: ' + msg);
        }

        const subtotal = Number(cantidad) * Number(precio);
        const mesaId = pedidoRow.mesa_id;

        const [result] = await db.query(
            `INSERT INTO pedido_items (tenant_id, pedido_id, producto_id, cantidad, unidad_medida, precio_unitario, subtotal, estado, nota)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente', ?)`,
            [tenantId, pedidoId, realProductId, cantidad, unidad || 'UND', precio, subtotal, nota || null]
        );

        if (mesaId) {
            await db.query("UPDATE mesas SET estado = 'ocupada' WHERE id = ? AND tenant_id = ?", [mesaId, tenantId]);
        }

        // Emitir evento SSE
        try {
            const WhatsAppService = require('../WhatsAppService');
            WhatsAppService.events.emit('orderCreated', {
                tenantId,
                pedidoId,
                mesaId,
                action: 'items_updated'
            });
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Error al emitir evento SSE en AgregarItemService:', err);
        }

        return { id: result.insertId };
    }

    /**
     * Asegura que exista un producto vinculado al insumo de cerámica para poder venderlo.
     * Crea una receta 1:1 para que el descuento de inventario sea automático.
     */
    static async _getOrCreateMirrorProduct(tenantId, insumoId, precioSugerido) {
        const [insumos] = await db.query('SELECT * FROM insumos WHERE id = ? AND tenant_id = ?', [insumoId, tenantId]);
        if (insumos.length === 0) {
            throw new Error('Insumo no encontrado');
        }
        const insumo = insumos[0];

        // 1. Buscar si ya existe un producto con el mismo código de insumo
        const [existentes] = await db.query(
            'SELECT id FROM productos WHERE tenant_id = ? AND codigo = ? AND activo = 1',
            [tenantId, insumo.codigo]
        );

        if (existentes.length > 0) {
            return existentes[0].id;
        }

        // 2. Asegurar categoría "Cerámicas" en productos
        const [cats] = await db.query(
            'SELECT id FROM categorias WHERE tenant_id = ? AND nombre = "Cerámicas" AND activa = 1',
            [tenantId]
        );
        let categoriaId;
        if (cats.length === 0) {
            const [newCat] = await db.query(
                'INSERT INTO categorias (tenant_id, nombre, descripcion) VALUES (?, "Cerámicas", "Productos derivados de inventario de cerámica")',
                [tenantId]
            );
            categoriaId = newCat.insertId;
        } else {
            categoriaId = cats[0].id;
        }

        // 3. Crear el producto
        const [prodResult] = await db.query(
            'INSERT INTO productos (tenant_id, codigo, nombre, precio_unidad, categoria_id) VALUES (?, ?, ?, ?, ?)',
            [tenantId, insumo.codigo, insumo.nombre, insumo.precio_venta || precioSugerido || 0, categoriaId]
        );
        const newProdId = prodResult.insertId;

        // 4. Crear Receta 1:1 para descuento automático
        const [recetaResult] = await db.query(
            'INSERT INTO recetas (tenant_id, producto_id, nombre_receta, porciones) VALUES (?, ?, ?, 1)',
            [tenantId, newProdId, insumo.nombre]
        );
        const recetaId = recetaResult.insertId;

        await db.query('INSERT INTO receta_ingredientes (receta_id, insumo_id, cantidad, unidad) VALUES (?, ?, 1, ?)', [
            recetaId,
            insumoId,
            insumo.unidad_base || 'UND'
        ]);

        return newProdId;
    }
}

module.exports = AgregarItemService;
