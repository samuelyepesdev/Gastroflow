const db = require('../../../config/database');
const TenantSeederService = require('./TenantSeederService');

class TenantCRUDService {
    static async getAllTenants() {
        const [rows] = await db.query(`
            SELECT t.id, t.nombre, t.email, t.slug, t.activo, t.config, t.plan_id, t.created_at, 
                   t.nit, t.direccion, t.telefono, t.ciudad, t.regimen_fiscal,
                   p.nombre AS plan_nombre, p.slug AS plan_slug
            FROM tenants t
            LEFT JOIN planes p ON t.plan_id = p.id
            ORDER BY t.created_at DESC
        `);
        return (rows || []).map(row => {
            let config = row.config;
            if (config && typeof config === 'string') {
                try {
                    config = JSON.parse(config);
                } catch (_) {
                    config = {};
                }
            }
            return {
                id: row.id,
                nombre: row.nombre,
                email: row.email,
                slug: row.slug,
                activo: row.activo,
                config: config || {},
                plan_id: row.plan_id,
                plan_nombre: row.plan_nombre,
                plan_slug: row.plan_slug,
                nit: row.nit,
                direccion: row.direccion,
                telefono: row.telefono,
                ciudad: row.ciudad,
                regimen_fiscal: row.regimen_fiscal,
                created_at: row.created_at
            };
        });
    }

    static async createTenant(data) {
        const {
            nombre,
            email,
            slug,
            config = {},
            activo = true,
            plan_id = 1,
            nit,
            direccion,
            telefono,
            ciudad,
            regimen_fiscal
        } = data;
        const [existing] = await db.query('SELECT id FROM tenants WHERE slug = ?', [slug]);
        if (existing.length > 0) {
            throw new Error('El slug ya existe');
        }
        const planId = plan_id !== null && plan_id !== undefined && plan_id !== '' ? parseInt(plan_id, 10) : 1;
        const [result] = await db.query(
            'INSERT INTO tenants (nombre, email, slug, config, activo, plan_id, nit, direccion, telefono, ciudad, regimen_fiscal) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                nombre,
                email || null,
                slug,
                JSON.stringify(config),
                activo ? 1 : 0,
                planId,
                nit || null,
                direccion || null,
                telefono || null,
                ciudad || null,
                regimen_fiscal || 'No responsable de IVA'
            ]
        );
        const tenantId = result.insertId;

        // Seed datos iniciales
        try {
            await TenantSeederService.seedInitialData(tenantId);
        } catch (e) {
            console.error(`Error al seedear datos iniciales para tenant ${tenantId}:`, e.message);
        }

        return { id: tenantId };
    }

    static async updateTenant(id, data) {
        const payload = [];
        const parts = [];

        const fields = [
            'nombre',
            'email',
            'activo',
            'plan_id',
            'nit',
            'direccion',
            'telefono',
            'ciudad',
            'regimen_fiscal',
            'tributo_default',
            'tasa_impuesto_default',
            'logo_data',
            'logo_tipo'
        ];
        fields.forEach(f => {
            if (data[f] !== undefined) {
                parts.push(`${f} = ?`);
                payload.push(f === 'activo' ? (data[f] ? 1 : 0) : data[f]);
            }
        });

        if (data.config !== undefined && data.config !== null) {
            parts.push('config = ?');
            const configStr = typeof data.config === 'string' ? data.config : JSON.stringify(data.config);
            payload.push(configStr);
        }

        if (parts.length === 0) {
            return { affectedRows: 0 };
        }

        const query = `UPDATE tenants SET ${parts.join(', ')} WHERE id = ?`;
        payload.push(id);
        const [result] = await db.query(query, payload);
        return result;
    }

    static async setTenantConfig(id, config) {
        const configStr = typeof config === 'string' ? config : JSON.stringify(config || {});
        const [result] = await db.query('UPDATE tenants SET config = ? WHERE id = ?', [configStr, id]);
        return result;
    }

    static async changeTenantStatus(id, activo) {
        const [result] = await db.query('UPDATE tenants SET activo = ? WHERE id = ?', [activo ? 1 : 0, id]);
        return result;
    }

    static async deleteTenant(id) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            // Disable FK checks to allow bulk deletion regardless of dependencies
            await connection.query('SET FOREIGN_KEY_CHECKS = 0');

            // Delete non-tenant_id dependencies first
            await connection.query(
                'DELETE FROM user_permisos WHERE user_id IN (SELECT id FROM usuarios WHERE tenant_id = ?)',
                [id]
            );
            await connection.query(
                'DELETE FROM detalle_factura WHERE factura_id IN (SELECT id FROM facturas WHERE tenant_id = ?)',
                [id]
            );
            await connection.query(
                'DELETE FROM producto_parametro WHERE producto_id IN (SELECT id FROM productos WHERE tenant_id = ?)',
                [id]
            );
            await connection.query(
                'DELETE FROM receta_ingredientes WHERE receta_id IN (SELECT id FROM recetas WHERE tenant_id = ?)',
                [id]
            );
            await connection.query(
                'DELETE FROM tema_parametro WHERE tema_id IN (SELECT id FROM temas WHERE tenant_id = ?)',
                [id]
            );

            // Delete all data associated with the tenant
            const tables = [
                'tenant_audit',
                'tenant_addons',
                'pedido_items',
                'pedidos',
                'movimientos_inventario',
                'facturas',
                'recetas',
                'productos',
                'categorias',
                'insumos',
                'eventos',
                'costos_fijos',
                'configuracion_costeo',
                'configuracion_impresion',
                'mesas',
                'clientes',
                'usuarios',
                'parametros',
                'temas'
            ];

            for (const table of tables) {
                await connection.query(`DELETE FROM ${table} WHERE tenant_id = ?`, [id]);
            }

            // Finally, delete the tenant itself
            await connection.query('DELETE FROM tenants WHERE id = ?', [id]);

            await connection.query('SET FOREIGN_KEY_CHECKS = 1');
            await connection.commit();
        } catch (error) {
            await connection.query('SET FOREIGN_KEY_CHECKS = 1'); // Ensure it's re-enabled
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async getTenantById(id) {
        const [rows] = await db.query(
            'SELECT t.*, p.nombre AS plan_nombre, p.slug AS plan_slug FROM tenants t LEFT JOIN planes p ON t.plan_id = p.id WHERE t.id = ?',
            [id]
        );
        const row = rows[0] || null;
        if (!row) {
            return null;
        }
        let config = row.config;
        if (config && typeof config === 'string') {
            try {
                config = JSON.parse(config);
            } catch (_) {
                config = {};
            }
        }
        return {
            ...row,
            config: config || {},
            plan_nombre: row.plan_nombre,
            plan_slug: row.plan_slug
        };
    }
}

module.exports = TenantCRUDService;
