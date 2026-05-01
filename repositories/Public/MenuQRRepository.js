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

        // Extraer paleta de colores completa de la configuración
        const themeColors = {
            primary: (config.colores && config.colores.primary) ? config.colores.primary : '#e63946',
            navbar: (config.colores && config.colores.navbar) ? config.colores.navbar : '#ffffff',
            navbarText: (config.colores && config.colores.navbarText) ? config.colores.navbarText : '#333333',
            secondary: (config.colores && config.colores.secondary) ? config.colores.secondary : '#6c757d',
            mesaLibre: (config.colores && config.colores.mesaLibre) ? config.colores.mesaLibre : '#22c55e',
            mesaOcupada: (config.colores && config.colores.mesaOcupada) ? config.colores.mesaOcupada : '#f59e0b'
        };

        return {
            id: row.id,
            nombre: row.nombre,
            slug: row.slug,
            logo_src: logo_src,
            theme_colors: themeColors,
            theme_font: config.theme_font || "'Inter', sans-serif"
        };
    }

    static async getMesaByQRToken(qrToken, tenantId) {
        const [rows] = await db.query(
            `SELECT id, numero, descripcion, estado, qr_session_id 
             FROM mesas 
             WHERE qr_token = ? AND tenant_id = ? AND tipo = "fisica"`,
            [qrToken, tenantId]
        );
        
        if (!rows.length) return null;
        
        const mesa = rows[0];
        
        // Si la mesa está libre y no tiene sesión, o si queremos forzar una nueva sesión al primer escaneo
        if (mesa.estado === 'libre' && !mesa.qr_session_id) {
            const newSessionId = Date.now().toString(); // Simple ID basado en tiempo
            await db.query(
                'UPDATE mesas SET qr_session_id = ?, last_qr_activity = NOW() WHERE id = ?',
                [newSessionId, mesa.id]
            );
            mesa.qr_session_id = newSessionId;
        }
        
        return mesa;
    }

    static async getCategoriasYProductosActivos(tenantId) {
        const [rows] = await db.query(`
            SELECT 
                c.id as categoria_id, c.nombre as categoria_nombre,
                p.id as producto_id, p.nombre, p.descripcion, p.precio_unidad, p.imagen_url, p.codigo
            FROM productos p
            JOIN categorias c ON p.categoria_id = c.id
            WHERE p.tenant_id = ? AND p.activo = 1 AND p.mostrar_en_qr = 1
            ORDER BY c.nombre ASC, p.nombre ASC
        `, [tenantId]);
        return rows;
    }
}

module.exports = MenuQRRepository;
