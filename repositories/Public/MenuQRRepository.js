const db = require('../../config/database');

class MenuQRRepository {
    static async getTenantBasicsBySlug(slug) {
        const [rows] = await db.query(
            `SELECT id, nombre, config, logo_data, logo_tipo, slug 
             FROM tenants 
             WHERE slug = ? AND activo = 1`, 
            [slug]
        );
        if (!rows.length) return null;
        
        const row = rows[0];
        let config = {};
        try {
            config = typeof row.config === 'string' ? JSON.parse(row.config) : (row.config || {});
        } catch (e) {}

        let logo_src = null;
        if (row.logo_data && row.logo_tipo) {
            logo_src = `data:image/${row.logo_tipo};base64,${Buffer.from(row.logo_data).toString('base64')}`;
        }

        return {
            id: row.id,
            nombre: row.nombre,
            slug: row.slug,
            theme_color: config.theme_color || '#e63946',
            theme_font: config.theme_font || "'Inter', sans-serif",
            logo_src
        };
    }

    static async getMesaByQRToken(qrToken, tenantId) {
        const [rows] = await db.query(
            `SELECT id, numero, descripcion, estado 
             FROM mesas 
             WHERE qr_token = ? AND tenant_id = ? AND tipo = "fisica"`,
            [qrToken, tenantId]
        );
        return rows[0] || null;
    }

    static async getCategoriasYProductosActivos(tenantId) {
        const [rows] = await db.query(`
            SELECT 
                c.id as categoria_id, c.nombre as categoria_nombre,
                p.id as producto_id, p.nombre, p.descripcion_corta, p.precio_unidad, p.imagen_url, p.codigo
            FROM productos p
            JOIN categorias c ON p.categoria_id = c.id
            WHERE p.tenant_id = ? AND p.deleted_at IS NULL AND p.mostrar_en_qr = 1
            ORDER BY c.nombre ASC, p.nombre ASC
        `, [tenantId]);
        return rows;
    }
}

module.exports = MenuQRRepository;
