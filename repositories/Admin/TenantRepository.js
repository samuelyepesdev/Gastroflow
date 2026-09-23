/**
 * TenantRepository - Data access layer for tenants (multi-tenancy)
 * Handles loading tenant by id/slug and validating active state.
 * Related to: middleware/tenant.js, AuthService
 */

const db = require('../../config/database');

class TenantRepository {
    /**
     * Find tenant by ID (with plan joined)
     * @param {number} id - Tenant ID
     * @returns {Promise<Object|null>} Tenant object or null
     */
    static async findById(id) {
        if (id === null || id === undefined) {
            return null;
        }
        const [rows] = await db.query(
            `SELECT t.id, t.nombre, t.email, t.slug, t.config, t.logo_data, t.logo_tipo, t.logo_url, t.activo, t.plan_id, t.created_at, t.updated_at,
                    t.nit, t.direccion, t.telefono, t.ciudad, t.regimen_fiscal,
                    t.estado_aprobacion, t.motivo_rechazo, t.tamano, t.suspendido_por_pago,
                    p.id AS plan_id_ref, p.nombre AS plan_nombre, p.slug AS plan_slug, p.descripcion AS plan_descripcion, p.caracteristicas AS plan_caracteristicas
             FROM tenants t
             LEFT JOIN planes p ON t.plan_id = p.id
             WHERE t.id = ?`,
            [id]
        );
        const row = rows[0];
        if (!row) {
            return null;
        }
        return TenantRepository._mapRow(row);
    }

    /**
     * Find tenant by ID only if active
     * @param {number} id - Tenant ID
     * @returns {Promise<Object|null>} Tenant object or null
     */
    static async findByIdAndActive(id) {
        if (id === null || id === undefined) {
            return null;
        }
        const [rows] = await db.query(
            `SELECT t.id, t.nombre, t.email, t.slug, t.config, t.logo_data, t.logo_tipo, t.logo_url, t.activo, t.plan_id, t.created_at, t.updated_at,
                    t.nit, t.direccion, t.telefono, t.ciudad, t.regimen_fiscal, t.tamano, t.suspendido_por_pago,
                    p.id AS plan_id_ref, p.nombre AS plan_nombre, p.slug AS plan_slug, p.descripcion AS plan_descripcion, p.caracteristicas AS plan_caracteristicas
             FROM tenants t LEFT JOIN planes p ON t.plan_id = p.id WHERE t.id = ? AND t.activo = TRUE`,
            [id]
        );
        const row = rows[0];
        if (!row) {
            return null;
        }
        return TenantRepository._mapRow(row);
    }

    /**
     * Find tenant by slug (e.g. 'principal')
     * @param {string} slug - Tenant slug
     * @returns {Promise<Object|null>} Tenant object or null
     */
    static async findBySlug(slug) {
        if (!slug) {
            return null;
        }
        const [rows] = await db.query(
            `SELECT t.id, t.nombre, t.email, t.slug, t.config, t.logo_data, t.logo_tipo, t.logo_url, t.activo, t.plan_id, t.created_at, t.updated_at,
                    t.nit, t.direccion, t.telefono, t.ciudad, t.regimen_fiscal, t.tamano, t.suspendido_por_pago,
                    p.id AS plan_id_ref, p.nombre AS plan_nombre, p.slug AS plan_slug, p.descripcion AS plan_descripcion, p.caracteristicas AS plan_caracteristicas
             FROM tenants t LEFT JOIN planes p ON t.plan_id = p.id WHERE t.slug = ? AND t.activo = TRUE`,
            [slug]
        );
        const row = rows[0];
        if (!row) {
            return null;
        }
        return TenantRepository._mapRow(row);
    }

    /**
     * Get default tenant (slug = 'principal')
     * @returns {Promise<Object|null>} Tenant object or null
     */
    static async getDefault() {
        return TenantRepository.findBySlug('principal');
    }

    static _mapRow(row) {
        let config = null;
        if (row.config) {
            try {
                config = typeof row.config === 'string' ? JSON.parse(row.config) : row.config;
            } catch (_) {
                config = {};
            }
        }
        let plan = null;
        if (row.plan_id_ref !== null && row.plan_id_ref !== undefined) {
            let caracteristicas = [];
            if (row.plan_caracteristicas) {
                try {
                    caracteristicas =
                        typeof row.plan_caracteristicas === 'string'
                            ? JSON.parse(row.plan_caracteristicas)
                            : row.plan_caracteristicas || [];
                } catch (_) {
                    /* intentional */
                }
            }
            plan = {
                id: row.plan_id_ref,
                nombre: row.plan_nombre,
                slug: row.plan_slug,
                descripcion: row.plan_descripcion || '',
                caracteristicas: Array.isArray(caracteristicas) ? caracteristicas : []
            };
        }
        const result = {
            id: row.id,
            nombre: row.nombre,
            email: row.email,
            slug: row.slug,
            config: config || {},
            activo: Boolean(row.activo),
            estado_aprobacion: row.estado_aprobacion || 'aprobado',
            motivo_rechazo: row.motivo_rechazo || null,
            tamano: row.tamano || 'pequeno',
            suspendido_por_pago: Boolean(row.suspendido_por_pago),
            plan_id: row.plan_id,
            plan: plan,
            nit: row.nit,
            direccion: row.direccion,
            telefono: row.telefono,
            ciudad: row.ciudad,
            regimen_fiscal: row.regimen_fiscal,
            created_at: row.created_at,
            updated_at: row.updated_at
        };

        if (row.logo_url) {
            result.logo_src = row.logo_url;
        } else if (row.logo_data && row.logo_tipo) {
            // Fallback para tenants que aún no pasaron por scripts/migrate-logos-to-r2.js
            const buffer = Buffer.from(row.logo_data);
            result.logo_src = `data:image/${row.logo_tipo};base64,${buffer.toString('base64')}`;
        }

        return result;
    }
}

module.exports = TenantRepository;
