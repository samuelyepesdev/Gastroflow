/**
 * ConfiguracionService - Business logic layer for configuration
 * Handles print configuration business logic
 * Related to: routes/configuracion.js, repositories/ConfiguracionRepository.js
 */

const ConfiguracionRepository = require('../../repositories/Tenant/ConfiguracionRepository');

class ConfiguracionService {
    /**
     * Get configuration for view (with image URLs)
     * @returns {Promise<Object>} Configuration object
     */
    static async getForView(tenantId) {
        const config = await ConfiguracionRepository.findOne(tenantId);

        if (!config) {
            // Return default values
            return {
                nombre_negocio: '',
                direccion: '',
                telefono: '',
                nit: '',
                pie_pagina: '',
                ancho_papel: 80,
                font_size: 1
            };
        }

        // Convert images to data URLs if they exist
        const configSinImagenes = { ...config };
        if (configSinImagenes.logo_url) {
            configSinImagenes.logo_src = configSinImagenes.logo_url;
        } else if (configSinImagenes.logo_data) {
            // Fallback para tenants que aún no pasaron por scripts/migrate-logos-to-r2.js
            const logoBuffer = Buffer.from(configSinImagenes.logo_data);
            configSinImagenes.logo_src = `data:image/${configSinImagenes.logo_tipo};base64,${logoBuffer.toString('base64')}`;
        }
        if (configSinImagenes.qr_data) {
            const qrBuffer = Buffer.from(configSinImagenes.qr_data);
            configSinImagenes.qr_src = `data:image/${configSinImagenes.qr_tipo};base64,${qrBuffer.toString('base64')}`;
        }

        delete configSinImagenes.logo_data;
        delete configSinImagenes.qr_data;

        return configSinImagenes;
    }

    /**
     * Get configuration for preview / impresión (por tenant).
     * Si no hay config, devuelve valores por defecto para que la factura se pueda imprimir.
     * @param {number} tenantId - Tenant ID
     * @returns {Promise<Object>} Configuration object with image URLs
     */
    static async getForPreview(tenantId) {
        const config = await ConfiguracionRepository.findOne(tenantId);
        const base = config
            ? { ...config }
            : {
                  nombre_negocio: 'Mi Negocio',
                  direccion: '',
                  telefono: '',
                  nit: '',
                  pie_pagina: '¡Gracias por su compra!',
                  ancho_papel: 80,
                  font_size: 1,
                  logo_data: null,
                  logo_tipo: null,
                  qr_data: null,
                  qr_tipo: null
              };

        if (base.logo_url) {
            base.logo_src = base.logo_url;
        } else if (base.logo_data) {
            // Fallback para tenants que aún no pasaron por scripts/migrate-logos-to-r2.js
            const logoBuffer = Buffer.from(base.logo_data);
            base.logo_src = `data:image/${base.logo_tipo};base64,${logoBuffer.toString('base64')}`;
        } else {
            base.logo_src = null;
        }
        if (base.qr_data) {
            const qrBuffer = Buffer.from(base.qr_data);
            base.qr_src = `data:image/${base.qr_tipo};base64,${qrBuffer.toString('base64')}`;
        } else {
            base.qr_src = null;
        }
        delete base.logo_data;
        delete base.qr_data;

        return base;
    }

    /**
     * Get printer/QZ Tray configuration for tenant (used by /configuracion/impresoras
     * and embedded into the print-JSON payload for the POS).
     * @param {number} tenantId - Tenant ID
     * @returns {Promise<Object>} Printer configuration
     */
    static async getPrinterConfig(tenantId) {
        const config = await ConfiguracionRepository.findOne(tenantId);
        return {
            qz_habilitado: !!config?.qz_habilitado,
            impresora_nombre: config?.impresora_nombre || null,
            imprimir_auto: config ? !!config.imprimir_auto : true,
            abrir_cajon_auto: config ? !!config.abrir_cajon_auto : true,
            cajon_comando_hex: config?.cajon_comando_hex || null
        };
    }

    /**
     * Save configuration
     * @param {Object} configData - Configuration data
     * @param {Object} files - Uploaded files (logo, qr)
     * @returns {Promise<void>}
     */
    static async save(tenantId, configData, files) {
        const {
            nombre_negocio,
            direccion,
            telefono,
            nit,
            pie_pagina,
            ancho_papel,
            font_size,
            impresora_nombre,
            cajon_comando_hex
        } = configData;

        const existingConfig = await ConfiguracionRepository.findOne(tenantId);

        const configToSave = {
            nombre_negocio,
            direccion: direccion || null,
            telefono: telefono || null,
            nit: nit || null,
            pie_pagina: pie_pagina || null,
            ancho_papel: ancho_papel || 80,
            font_size: font_size || 1,
            qz_habilitado: configData.qz_habilitado === 'on' || configData.qz_habilitado === true ? 1 : 0,
            impresora_nombre: impresora_nombre?.trim() || null,
            imprimir_auto: configData.imprimir_auto === 'on' || configData.imprimir_auto === true ? 1 : 0,
            abrir_cajon_auto: configData.abrir_cajon_auto === 'on' || configData.abrir_cajon_auto === true ? 1 : 0,
            cajon_comando_hex: cajon_comando_hex?.trim() || null
        };

        if (files?.logo) {
            const R2StorageService = require('./R2StorageService');
            configToSave.logo_url = await R2StorageService.uploadFile(
                files.logo[0].buffer,
                files.logo[0].originalname,
                files.logo[0].mimetype,
                'logos'
            );
        }
        if (files?.qr) {
            configToSave.qr_data = files.qr[0].buffer;
            configToSave.qr_tipo = files.qr[0].mimetype.split('/')[1];
        }

        if (!existingConfig) {
            await ConfiguracionRepository.create(tenantId, configToSave);
        } else {
            configToSave.id = existingConfig.id;
            await ConfiguracionRepository.update(existingConfig.id, tenantId, configToSave);
        }
    }

    /**
     * Initialize configuration if it doesn't exist
     * @returns {Promise<void>}
     */
    static async initializeIfNeeded(tenantId) {
        const config = await ConfiguracionRepository.findOne(tenantId);
        if (!config) {
            await ConfiguracionRepository.createInitial(tenantId);
        }
    }
}

module.exports = ConfiguracionService;
