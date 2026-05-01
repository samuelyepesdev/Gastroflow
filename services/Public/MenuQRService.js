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

        return { tenant, mesa, categorias };
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
                imagen_url: row.imagen_url || null
            });
        });

        return Array.from(categoriasMap.values());
    }
}

module.exports = MenuQRService;
