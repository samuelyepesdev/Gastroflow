/**
 * ProductService - Business logic layer for products
 * Handles product business logic and validation
 * Related to: routes/productos.js, repositories/ProductRepository.js
 */

const ProductRepository = require('../../repositories/Tenant/ProductRepository');
const CategoryRepository = require('../../repositories/Admin/CategoryRepository');
const db = require('../../config/database');

class ProductService {
    /**
     * Get all products with categories for view rendering
     * @returns {Promise<Object>} Object with products and categories arrays
     */
    static async getAllForView(tenantId) {
        const productos = await ProductRepository.findAll(tenantId);
        const categorias = await CategoryRepository.findAllActive(tenantId);
        return { productos, categorias };
    }

    /**
     * Get product by ID (within tenant)
     * @param {number} id - Product ID
     * @param {number} tenantId - Tenant ID
     * @returns {Promise<Object>} Product object
     * @throws {Error} If product not found
     */
    static async getById(id, tenantId) {
        const producto = await ProductRepository.findById(id, tenantId);
        if (!producto) {
            throw new Error('Producto no encontrado');
        }
        return producto;
    }

    /**
     * Search products (within tenant)
     * @param {string} query - Search term
     * @param {number} tenantId - Tenant ID
     * @returns {Promise<Array>} Array of products
     */
    static async search(query, tenantId) {
        if (!query || query.trim().length === 0) {
            return [];
        }
        return await ProductRepository.search(query.trim(), tenantId, 10);
    }

    /**
     * Create a new product
     * @param {Object} productData - Product data
     * @returns {Promise<Object>} Created product result
     * @throws {Error} If validation fails or duplicate code
     */
    static async create(tenantId, productData) {
        const { codigo, nombre, precio_unidad, categoria_id, descripcion, imagen_url, tributo, tasa_impuesto } =
            productData;

        if (!codigo || !nombre) {
            throw new Error('El código y nombre son requeridos');
        }

        if (categoria_id) {
            const category = await CategoryRepository.findById(categoria_id, tenantId);
            if (!category) {
                throw new Error('Categoría no encontrada');
            }
        }

        try {
            const result = await ProductRepository.create(tenantId, {
                codigo: codigo.trim(),
                nombre: nombre.trim(),
                precio_unidad: parseFloat(precio_unidad) || 0,
                categoria_id: categoria_id || 1,
                descripcion: descripcion ? descripcion.trim() : null,
                imagen_url: imagen_url || null,
                tributo: tributo || null,
                tasa_impuesto:
                    tasa_impuesto !== undefined && tasa_impuesto !== null && tasa_impuesto !== ''
                        ? parseFloat(tasa_impuesto)
                        : null
            });

            return {
                id: result.insertId,
                message: 'Producto creado exitosamente'
            };
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                throw new Error('Ya existe un producto con ese código', { cause: error });
            }
            throw error;
        }
    }

    /**
     * Update product by ID
     * @param {number} id - Product ID
     * @param {Object} productData - Product data to update
     * @returns {Promise<Object>} Update result
     * @throws {Error} If product not found or validation fails
     */
    static async update(id, tenantId, productData) {
        const { codigo, nombre, precio_unidad, categoria_id, descripcion, imagen_url, tributo, tasa_impuesto } =
            productData;

        if (!codigo || !nombre) {
            throw new Error('El código y nombre son requeridos');
        }

        const existingProduct = await ProductRepository.findById(id, tenantId);
        if (!existingProduct) {
            throw new Error('Producto no encontrado');
        }

        if (categoria_id) {
            const category = await CategoryRepository.findById(categoria_id, tenantId);
            if (!category) {
                throw new Error('Categoría no encontrada');
            }
        }

        try {
            const result = await ProductRepository.update(id, tenantId, {
                codigo: codigo.trim(),
                nombre: nombre.trim(),
                precio_unidad: parseFloat(precio_unidad) || 0,
                categoria_id: categoria_id || 1,
                descripcion: descripcion ? descripcion.trim() : null,
                imagen_url: imagen_url || null,
                tributo: tributo || null,
                tasa_impuesto:
                    tasa_impuesto !== undefined && tasa_impuesto !== null && tasa_impuesto !== ''
                        ? parseFloat(tasa_impuesto)
                        : null
            });

            if (result.affectedRows === 0) {
                throw new Error('No se pudo actualizar el producto');
            }

            return { message: 'Producto actualizado exitosamente' };
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                throw new Error('Ya existe un producto con ese código', { cause: error });
            }
            throw error;
        }
    }

    /**
     * Update only product price (e.g. apply suggested price from costeo)
     * @param {number} id - Product ID
     * @param {number} tenantId - Tenant ID
     * @param {number} precioUnidad - New unit price
     * @returns {Promise<Object>}
     */
    static async updatePrecio(id, tenantId, precioUnidad) {
        const existing = await ProductRepository.findById(id, tenantId);
        if (!existing) {
            throw new Error('Producto no encontrado');
        }
        const result = await ProductRepository.updatePrecio(id, tenantId, precioUnidad);
        if (result.affectedRows === 0) {
            throw new Error('No se pudo actualizar el precio');
        }
        return { message: 'Precio actualizado' };
    }

    /**
     * Delete product by ID
     * @param {number} id - Product ID
     * @returns {Promise<Object>} Delete result
     * @throws {Error} If product not found
     */
    static async delete(id, tenantId) {
        const producto = await ProductRepository.findById(id, tenantId);
        if (!producto) {
            throw new Error('Producto no encontrado');
        }

        const result = await ProductRepository.delete(id, tenantId);
        if (result.affectedRows === 0) {
            throw new Error('No se pudo desactivar el producto');
        }

        return { message: 'Producto eliminado exitosamente' };
    }

    static async importFromExcel(tenantId, rows) {
        if (!rows || rows.length === 0) {
            throw new Error('No hay registros válidos para importar');
        }

        const categoryMap = await CategoryRepository.getCategoryMap(tenantId);
        let inserted = 0;
        let updated = 0;
        const errores = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const fila = i + 2; // +1 cabecera, +1 base 1

            try {
                if (!row.codigo || !row.nombre) {
                    errores.push({ fila, mensaje: 'Código y nombre son requeridos' });
                    continue;
                }

                // 1. Obtener o crear categoría
                const categoriaNombre = (row.categoria || 'General').trim();
                let categoriaId = categoryMap.get(categoriaNombre.toLowerCase());

                if (!categoriaId) {
                    // Crear categoría al vuelo
                    categoriaId = await CategoryRepository.create(tenantId, {
                        nombre: categoriaNombre,
                        descripcion: 'Creada automáticamente mediante importación'
                    });
                    categoryMap.set(categoriaNombre.toLowerCase(), categoriaId);
                }

                // 2. Realizar Upsert robusto
                // MySQL reporta 1 para insert, 2 para update.
                const [result] = await db.query(
                    `INSERT INTO productos (tenant_id, codigo, nombre, categoria_id, precio_unidad, activo) 
                     VALUES (?, ?, ?, ?, ?, 1) 
                     ON DUPLICATE KEY UPDATE 
                        nombre = VALUES(nombre), 
                        categoria_id = VALUES(categoria_id), 
                        precio_unidad = VALUES(precio_unidad),
                        activo = 1`,
                    [
                        tenantId,
                        String(row.codigo).trim(),
                        String(row.nombre).trim(),
                        categoriaId,
                        parseFloat(row.precio_unidad) || 0
                    ]
                );

                if (result.affectedRows === 1) {
                    inserted++;
                } else if (result.affectedRows === 2) {
                    updated++;
                } else {
                    updated++;
                } // Si no hubo cambios reales, affectedRows puede ser 0 pero cuenta como revisado
            } catch (err) {
                console.error(`Error en fila ${fila}:`, err);
                errores.push({ fila, mensaje: err.message });
            }
        }

        return {
            success: true,
            total: rows.length,
            inserted,
            updated,
            errores
        };
    }

    /**
     * Toggle favorite status
     * @param {number} id - Product ID
     * @param {number} tenantId - Tenant ID
     * @param {boolean} esFavorito - Favorite status
     * @returns {Promise<Object>} Update result
     */
    static async toggleFavorite(id, tenantId, esFavorito) {
        return await ProductRepository.toggleFavorite(id, tenantId, esFavorito);
    }
}

module.exports = ProductService;
