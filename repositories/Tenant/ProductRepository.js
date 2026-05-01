/**
 * ProductRepository - Data access layer for products
 * Handles all SQL queries related to products
 * Related to: routes/productos.js, services/ProductService.js
 */

const db = require('../../config/database');

class ProductRepository {
    /**
     * Get all products with their categories
     * @returns {Promise<Array>} Array of products
     */
    static async findAll(tenantId) {
        const [productos] = await db.query(`
            SELECT p.*, c.nombre as categoria_nombre 
            FROM productos p 
            LEFT JOIN categorias c ON p.categoria_id = c.id 
            WHERE p.tenant_id = ? AND p.activo = 1
            ORDER BY p.nombre
        `, [tenantId]);
        return productos;
    }

    /**
     * Find product by ID with category
     * @param {number} id - Product ID
     * @returns {Promise<Object|null>} Product object or null
     */
    static async findById(id, tenantId) {
        const [productos] = await db.query(`
            SELECT p.*, c.nombre as categoria_nombre 
            FROM productos p 
            LEFT JOIN categorias c ON p.categoria_id = c.id 
            WHERE p.id = ? AND p.tenant_id = ? AND p.activo = 1
        `, [id, tenantId]);
        return productos[0] || null;
    }

    /**
     * Search products by name or code, including ingredients from 'Cerámicas' category
     * @param {string} queryTerm - Search term
     * @param {number} tenantId - Tenant ID
     * @param {number} limit - Maximum results
     * @returns {Promise<Array>} Array of products and virtual products for ceramics
     */
    static async search(queryTerm, tenantId, limit = 10) {
        const searchTerm = `%${queryTerm}%`;
        
        // Buscamos productos reales y opcionalmente insumos de la categoría 'Cerámicas'
        const sql = `
            (SELECT p.id, p.codigo, p.nombre, p.precio_unidad, c.nombre AS categoria_nombre, 0 AS is_insumo
            FROM productos p
            LEFT JOIN categorias c ON p.categoria_id = c.id
            WHERE p.tenant_id = ? AND p.activo = 1 AND (p.nombre LIKE ? OR p.codigo LIKE ?)
            ORDER BY p.nombre
            LIMIT ?)
            UNION ALL
            (SELECT i.id + 1000000 AS id, i.codigo, i.nombre, COALESCE(i.precio_venta, 0) AS precio_unidad, pc.name AS categoria_nombre, 1 AS is_insumo
            FROM insumos i
            INNER JOIN parametros pc ON i.categoria_id = pc.id
            WHERE i.tenant_id = ? AND pc.name = 'Cerámicas' AND (i.nombre LIKE ? OR i.codigo LIKE ?)
            ORDER BY i.nombre
            LIMIT ?)
            LIMIT ?
        `;
        
        const [rows] = await db.query(sql, [
            tenantId, searchTerm, searchTerm, limit,
            tenantId, searchTerm, searchTerm, limit,
            limit
        ]);
        
        return rows;
    }

    /**
     * Create a new product
     * @param {Object} productData - Product data
     * @param {string} productData.codigo - Product code
     * @param {string} productData.nombre - Product name
     * @param {number} productData.precio_unidad - Unit price
     * @param {number} productData.categoria_id - Category ID
     * @param {string} [productData.descripcion] - Product description
     * @returns {Promise<Object>} Created product with insertId
     */
    static async create(tenantId, productData) {
        const { codigo, nombre, precio_unidad, categoria_id, descripcion } = productData;
        const result = await db.query(
            'INSERT INTO productos (tenant_id, codigo, nombre, precio_unidad, categoria_id, descripcion) VALUES (?, ?, ?, ?, ?, ?)',
            [tenantId, codigo, nombre, precio_unidad || 0, categoria_id || 1, descripcion || null]
        );
        return result;
    }

    /**
     * Update product by ID
     * @param {number} id - Product ID
     * @param {Object} productData - Product data to update
     * @returns {Promise<Object>} Update result
     */
    static async update(id, tenantId, productData) {
        const { codigo, nombre, precio_unidad, categoria_id, descripcion } = productData;
        const result = await db.query(
            'UPDATE productos SET codigo = ?, nombre = ?, precio_unidad = ?, categoria_id = ?, descripcion = ? WHERE id = ? AND tenant_id = ?',
            [codigo, nombre, precio_unidad || 0, categoria_id || 1, descripcion || null, id, tenantId]
        );
        return result;
    }

    /**
     * Update only product price (for applying suggested price from costeo)
     * @param {number} id - Product ID
     * @param {number} tenantId - Tenant ID
     * @param {number} precioUnidad - New unit price
     * @returns {Promise<Object>} Update result
     */
    static async updatePrecio(id, tenantId, precioUnidad) {
        const [result] = await db.query(
            'UPDATE productos SET precio_unidad = ? WHERE id = ? AND tenant_id = ?',
            [parseFloat(precioUnidad) || 0, id, tenantId]
        );
        return result;
    }

    /**
     * Delete product by ID
     * @param {number} id - Product ID
     * @returns {Promise<Object>} Delete result
     */
    static async delete(id, tenantId) {
        const [result] = await db.query(
            'UPDATE productos SET activo = 0 WHERE id = ? AND tenant_id = ?',
            [id, tenantId]
        );
        return result;
    }

    /**
     * Bulk insert/update products (for Excel import)
     * @param {Array<Object>} products - Array of product objects
     * @returns {Promise<void>}
     */
    static async bulkUpsert(tenantId, products) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            for (const p of products) {
                await connection.query(
                    `INSERT INTO productos (tenant_id, codigo, nombre, categoria_id, precio_unidad, descripcion, activo) 
                     VALUES (?, ?, ?, ?, ?, ?, 1) 
                     ON DUPLICATE KEY UPDATE 
                        nombre = VALUES(nombre), 
                        categoria_id = VALUES(categoria_id), 
                        precio_unidad = VALUES(precio_unidad),
                        descripcion = VALUES(descripcion),
                        activo = 1`,
                    [tenantId, String(p.codigo).trim(), String(p.nombre).trim(), p.categoria_id, parseFloat(p.precio_unidad) || 0, p.descripcion || null]
                );
            }
            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Toggle favorite status
     * @param {number} id - Product ID
     * @param {number} tenantId - Tenant ID
     * @param {boolean} esFavorito - Favorite status
     * @returns {Promise<Object>} Update result
     */
    static async toggleFavorite(id, tenantId, esFavorito) {
        const [result] = await db.query(
            'UPDATE productos SET es_favorito = ? WHERE id = ? AND tenant_id = ?',
            [esFavorito ? 1 : 0, id, tenantId]
        );
        return result;
    }
}

module.exports = ProductRepository;

