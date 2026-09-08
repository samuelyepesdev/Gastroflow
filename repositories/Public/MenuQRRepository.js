const db = require('../../config/database');

class MenuQRRepository {
    static async getTenantBasicsBySlug(slug) {
        const [rows] = await db.query(
            `SELECT id, nombre, config, logo_data, logo_tipo, slug 
             FROM tenants 
             WHERE slug = ? AND activo = 1`, 
            [slug]
        );
        if (!rows.length) {return null;}
        
        const row = rows[0];
        let config = {};
        try {
            config = typeof row.config === 'string' ? JSON.parse(row.config) : (row.config || {});
        } catch (e) { /* intentional */ }

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
        
        if (!rows.length) {return null;}
        
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
                p.id as producto_id, p.nombre, p.descripcion, p.precio_unidad, p.imagen_url, p.codigo, p.pide_nota
            FROM productos p
            JOIN categorias c ON p.categoria_id = c.id
            WHERE p.tenant_id = ? AND p.activo = 1 AND p.mostrar_en_qr = 1
            ORDER BY c.nombre ASC, p.nombre ASC
        `, [tenantId]);
        return rows;
    }

    /**
     * Grupos de modificadores/toppings (con sus opciones activas) de un conjunto de
     * productos, en una sola consulta. Devuelve filas planas producto+grupo+opcion
     * que el Service agrupa. Solo grupos y opciones activos.
     */
    static async getModificadoresParaProductos(tenantId, productoIds) {
        if (!productoIds || productoIds.length === 0) {
            return [];
        }
        const [rows] = await db.query(`
            SELECT
                pmg.producto_id,
                g.id AS grupo_id, g.nombre AS grupo_nombre, g.descripcion AS grupo_descripcion,
                g.tipo_seleccion, g.obligatorio, g.minimo_selecciones, g.maximo_selecciones,
                pmg.orden AS grupo_orden,
                o.id AS opcion_id, o.nombre AS opcion_nombre, o.precio_adicional, o.orden AS opcion_orden
            FROM producto_modificador_grupo pmg
            JOIN grupos_modificadores g ON g.id = pmg.grupo_id AND g.tenant_id = ? AND g.activo = 1
            LEFT JOIN opciones_modificador o ON o.grupo_id = g.id AND o.activo = 1
            WHERE pmg.producto_id IN (?)
            ORDER BY pmg.producto_id, pmg.orden, g.nombre, o.orden, o.id
        `, [tenantId, productoIds]);
        return rows;
    }
}

module.exports = MenuQRRepository;
