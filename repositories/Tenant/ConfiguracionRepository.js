/**
 * ConfiguracionRepository - Data access layer for configuration
 * Handles all SQL queries related to print configuration
 * Related to: routes/configuracion.js, services/ConfiguracionService.js
 */

const db = require('../../config/database');

class ConfiguracionRepository {
    /**
     * Get configuration for tenant (first record for that tenant)
     * @param {number} tenantId - Tenant ID
     * @returns {Promise<Object|null>} Configuration object or null
     */
    static async findOne(tenantId) {
        const [config] = await db.query('SELECT * FROM configuracion_impresion WHERE tenant_id = ? LIMIT 1', [
            tenantId
        ]);
        return config[0] || null;
    }

    /**
     * Create initial configuration for tenant
     * @param {number} tenantId - Tenant ID
     * @returns {Promise<Object>} Created configuration with insertId
     */
    static async createInitial(tenantId) {
        const [result] = await db.query(
            `
            INSERT INTO configuracion_impresion 
            (tenant_id, nombre_negocio, direccion, telefono, pie_pagina) 
            VALUES 
            (?, 'Mi Negocio', 'Dirección del Negocio', 'Teléfono', '¡Gracias por su compra!')
        `,
            [tenantId]
        );
        return result;
    }

    /**
     * Create new configuration for tenant
     * @param {number} tenantId - Tenant ID
     * @param {Object} configData - Configuration data
     * @returns {Promise<Object>} Created configuration with insertId
     */
    static async create(tenantId, configData) {
        const {
            nombre_negocio,
            direccion,
            telefono,
            nit,
            pie_pagina,
            ancho_papel,
            font_size,
            logo_data,
            logo_tipo,
            logo_url,
            qr_data,
            qr_tipo,
            qz_habilitado,
            impresora_nombre,
            imprimir_auto,
            abrir_cajon_auto,
            cajon_comando_hex
        } = configData;

        let sql = `
            INSERT INTO configuracion_impresion
            (tenant_id, nombre_negocio, direccion, telefono, nit, pie_pagina, ancho_papel, font_size,
             qz_habilitado, impresora_nombre, imprimir_auto, abrir_cajon_auto, cajon_comando_hex
        `;
        const values = [
            tenantId,
            nombre_negocio,
            direccion || null,
            telefono || null,
            nit || null,
            pie_pagina || null,
            ancho_papel || 80,
            font_size || 1,
            qz_habilitado ? 1 : 0,
            impresora_nombre || null,
            imprimir_auto ? 1 : 0,
            abrir_cajon_auto ? 1 : 0,
            cajon_comando_hex || null
        ];

        if (logo_url) {
            sql += ', logo_url';
            values.push(logo_url);
        } else if (logo_data) {
            sql += ', logo_data, logo_tipo';
            values.push(logo_data, logo_tipo);
        }
        if (qr_data) {
            sql += ', qr_data, qr_tipo';
            values.push(qr_data, qr_tipo);
        }
        sql += ') VALUES (' + values.map(() => '?').join(',') + ')';

        const result = await db.query(sql, values);
        return result;
    }

    /**
     * Update configuration (for tenant)
     * @param {number} id - Configuration ID
     * @param {number} tenantId - Tenant ID
     * @param {Object} configData - Configuration data to update
     * @returns {Promise<Object>} Update result
     */
    static async update(id, tenantId, configData) {
        const {
            nombre_negocio,
            direccion,
            telefono,
            nit,
            pie_pagina,
            ancho_papel,
            font_size,
            logo_data,
            logo_tipo,
            logo_url,
            qr_data,
            qr_tipo,
            qz_habilitado,
            impresora_nombre,
            imprimir_auto,
            abrir_cajon_auto,
            cajon_comando_hex
        } = configData;

        let sql = `
            UPDATE configuracion_impresion
            SET nombre_negocio = ?, direccion = ?, telefono = ?, nit = ?,
                pie_pagina = ?, ancho_papel = ?, font_size = ?,
                qz_habilitado = ?, impresora_nombre = ?, imprimir_auto = ?, abrir_cajon_auto = ?, cajon_comando_hex = ?
        `;
        const values = [
            nombre_negocio,
            direccion || null,
            telefono || null,
            nit || null,
            pie_pagina || null,
            ancho_papel || 80,
            font_size || 1,
            qz_habilitado ? 1 : 0,
            impresora_nombre || null,
            imprimir_auto ? 1 : 0,
            abrir_cajon_auto ? 1 : 0,
            cajon_comando_hex || null
        ];

        if (logo_url) {
            sql += ', logo_url = ?, logo_data = NULL, logo_tipo = NULL';
            values.push(logo_url);
        } else if (logo_data) {
            sql += ', logo_data = ?, logo_tipo = ?';
            values.push(logo_data, logo_tipo);
        }
        if (qr_data) {
            sql += ', qr_data = ?, qr_tipo = ?';
            values.push(qr_data, qr_tipo);
        }
        sql += ' WHERE id = ? AND tenant_id = ?';
        values.push(id, tenantId);

        const result = await db.query(sql, values);
        return result;
    }
}

module.exports = ConfiguracionRepository;
