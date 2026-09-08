const MenuQRRepository = require('../../repositories/Public/MenuQRRepository');

class MenuQRService {
    /**
     * Obtiene todos los datos necesarios para renderizar el menú (Tenant, Mesa, Productos agrupados)
     */
    static async getMenuData(tenantSlug, qrToken) {
        // 1. Validar Tenant
        const tenant = await MenuQRRepository.getTenantBasicsBySlug(tenantSlug);
        if (!tenant) {
            const error = new Error('Restaurante no encontrado o inactivo.');
            error.status = 404;
            throw error;
        }

        // 2. Validar Mesa
        const mesa = await MenuQRRepository.getMesaByQRToken(qrToken, tenant.id);
        if (!mesa) {
            const error = new Error('El código QR no es válido o la mesa no existe.');
            error.status = 404;
            throw error;
        }

        // 3. Obtener Categorías y Productos
        const rawProducts = await MenuQRRepository.getCategoriasYProductosActivos(tenant.id);
        const categorias = this._agruparProductosPorCategoria(rawProducts);

        // 4. Obtener modificadores/toppings de esos productos y armar el mapa producto_id -> grupos[]
        const productoIds = rawProducts.map(r => r.producto_id);
        const rawModificadores = await MenuQRRepository.getModificadoresParaProductos(tenant.id, productoIds);
        const modificadores = this._armarMapaModificadores(rawModificadores);

        return { tenant, mesa, categorias, modificadores };
    }

    static _agruparProductosPorCategoria(rawProducts) {
        const categoriasMap = new Map();

        rawProducts.forEach(row => {
            if (!categoriasMap.has(row.categoria_id)) {
                categoriasMap.set(row.categoria_id, {
                    id: row.categoria_id,
                    nombre: row.categoria_nombre,
                    productos: []
                });
            }
            categoriasMap.get(row.categoria_id).productos.push({
                id: row.producto_id,
                codigo: row.codigo,
                nombre: row.nombre,
                descripcion: row.descripcion || '',
                precio: row.precio_unidad,
                imagen_url: row.imagen_url || null,
                pide_nota: row.pide_nota === 1 || row.pide_nota === true ? 1 : 0
            });
        });

        return Array.from(categoriasMap.values());
    }

    /**
     * Convierte las filas planas producto+grupo+opcion en un objeto
     * { [producto_id]: [ { id, nombre, tipo_seleccion, obligatorio, minimo_selecciones,
     *   maximo_selecciones, opciones: [{ id, nombre, precio_adicional }] } ] }.
     * Descarta grupos que se quedaron sin opciones activas.
     */
    static _armarMapaModificadores(rawRows) {
        const mapa = {};
        if (!rawRows || rawRows.length === 0) {
            return mapa;
        }

        const gruposPorProducto = new Map(); // producto_id -> Map(grupo_id -> grupo)
        for (const row of rawRows) {
            if (!gruposPorProducto.has(row.producto_id)) {
                gruposPorProducto.set(row.producto_id, new Map());
            }
            const gruposMap = gruposPorProducto.get(row.producto_id);
            if (!gruposMap.has(row.grupo_id)) {
                gruposMap.set(row.grupo_id, {
                    id: row.grupo_id,
                    nombre: row.grupo_nombre,
                    descripcion: row.grupo_descripcion || '',
                    tipo_seleccion: row.tipo_seleccion,
                    obligatorio: row.obligatorio === 1 || row.obligatorio === true,
                    minimo_selecciones: row.minimo_selecciones || 0,
                    maximo_selecciones: row.maximo_selecciones || 0,
                    opciones: []
                });
            }
            if (row.opcion_id) {
                gruposMap.get(row.grupo_id).opciones.push({
                    id: row.opcion_id,
                    nombre: row.opcion_nombre,
                    precio_adicional: Number(row.precio_adicional) || 0
                });
            }
        }

        for (const [productoId, gruposMap] of gruposPorProducto.entries()) {
            const grupos = Array.from(gruposMap.values()).filter(g => g.opciones.length > 0);
            if (grupos.length > 0) {
                mapa[productoId] = grupos;
            }
        }
        return mapa;
    }
}

module.exports = MenuQRService;
