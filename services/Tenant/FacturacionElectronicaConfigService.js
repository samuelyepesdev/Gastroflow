/**
 * FacturacionElectronicaConfigService - Configuración fiscal de facturación
 * electrónica (Factus) por tenant. Fase 2 del plan de integración.
 */

const FacturacionElectronicaConfigRepository = require('../../repositories/Tenant/FacturacionElectronicaConfigRepository');
const CryptoService = require('../Shared/CryptoService');
const FactusClient = require('../Integrations/Factus/FactusClient');
const logger = require('../../utils/logger');

const MASK = '••••••••';

class FacturacionElectronicaConfigService {
    /**
     * Configuración para mostrar en el admin. Los secretos nunca se envían en claro:
     * si existen, se representan con un valor enmascarado.
     * @param {number} tenantId
     * @returns {Promise<Object>}
     */
    static async getForAdmin(tenantId) {
        const config = await FacturacionElectronicaConfigRepository.findByTenantId(tenantId);
        if (!config) {
            return {
                proveedor: 'factus',
                ambiente: 'sandbox',
                estado: 'deshabilitado',
                client_id: '',
                client_secret_configurado: false,
                api_usuario: '',
                api_password_configurado: false,
                codigo_municipio_dane: '',
                tipo_organizacion: '',
                numbering_range_id: '',
                numbering_range_prefijo: '',
                numbering_range_desde: null,
                numbering_range_hasta: null,
                numbering_range_vigencia_hasta: null,
                ultima_verificacion: null,
                ultimo_error: null
            };
        }
        return {
            proveedor: config.proveedor,
            ambiente: config.ambiente,
            estado: config.estado,
            client_id: config.client_id || '',
            client_secret_configurado: !!config.client_secret_enc,
            api_usuario: config.api_usuario || '',
            api_password_configurado: !!config.api_password_enc,
            codigo_municipio_dane: config.codigo_municipio_dane || '',
            tipo_organizacion: config.tipo_organizacion || '',
            numbering_range_id: config.numbering_range_id || '',
            numbering_range_prefijo: config.numbering_range_prefijo || '',
            numbering_range_desde: config.numbering_range_desde,
            numbering_range_hasta: config.numbering_range_hasta,
            numbering_range_vigencia_hasta: config.numbering_range_vigencia_hasta,
            ultima_verificacion: config.ultima_verificacion,
            ultimo_error: config.ultimo_error
        };
    }

    /**
     * Credenciales descifradas listas para instanciar un FactusClient. Uso interno
     * (worker de emisión, prueba de conexión) — nunca exponer al frontend.
     * @param {number} tenantId
     * @returns {Promise<Object|null>}
     */
    static async getDecryptedForClient(tenantId) {
        const config = await FacturacionElectronicaConfigRepository.findByTenantId(tenantId);
        if (!config) {
            return null;
        }
        return {
            tenantId,
            ambiente: config.ambiente,
            clientId: config.client_id,
            clientSecret: config.client_secret_enc ? CryptoService.decrypt(config.client_secret_enc) : null,
            apiUsuario: config.api_usuario,
            apiPassword: config.api_password_enc ? CryptoService.decrypt(config.api_password_enc) : null
        };
    }

    /**
     * Guarda la configuración del formulario admin. Si client_secret / api_password
     * vienen vacíos (el usuario no los tocó, ve el placeholder enmascarado), se
     * conservan los valores cifrados existentes.
     * @param {number} tenantId
     * @param {Object} data
     */
    static async save(tenantId, data) {
        const existing = await FacturacionElectronicaConfigRepository.findByTenantId(tenantId);

        const toSave = {
            ambiente: data.ambiente === 'produccion' ? 'produccion' : 'sandbox',
            client_id: data.client_id || null,
            api_usuario: data.api_usuario || null,
            codigo_municipio_dane: data.codigo_municipio_dane || null,
            tipo_organizacion: data.tipo_organizacion || null
        };

        if (data.client_secret) {
            toSave.client_secret_enc = CryptoService.encrypt(data.client_secret);
        } else if (existing) {
            toSave.client_secret_enc = existing.client_secret_enc;
        }

        if (data.api_password) {
            toSave.api_password_enc = CryptoService.encrypt(data.api_password);
        } else if (existing) {
            toSave.api_password_enc = existing.api_password_enc;
        }

        await FacturacionElectronicaConfigRepository.upsert(tenantId, toSave);
        return FacturacionElectronicaConfigService.getForAdmin(tenantId);
    }

    /**
     * Prueba la conexión OAuth2 con las credenciales guardadas para el tenant.
     * @param {number} tenantId
     * @returns {Promise<{ok: boolean, error?: string}>}
     */
    static async testConnection(tenantId) {
        try {
            const creds = await FacturacionElectronicaConfigService.getDecryptedForClient(tenantId);
            if (!creds || !creds.clientId || !creds.clientSecret || !creds.apiUsuario || !creds.apiPassword) {
                throw new Error('Debe completar y guardar las credenciales antes de probar la conexión');
            }
            const client = new FactusClient(creds);
            await client.testConnection();
            await FacturacionElectronicaConfigRepository.registrarVerificacion(tenantId, null);
            return { ok: true };
        } catch (error) {
            logger.error('Error al probar conexión Factus', { tenantId, error: error.message });
            await FacturacionElectronicaConfigRepository.registrarVerificacion(tenantId, error.message).catch(() => {});
            return { ok: false, error: error.message };
        }
    }

    /**
     * Encola la factura para emisión electrónica si el tenant tiene FE activa.
     * Pensado para llamarse justo después de cerrar una venta (POS, mesas, eventos);
     * nunca debe bloquear ni fallar el flujo de venta.
     * @param {number} facturaId
     * @param {number} tenantId
     */
    static async encolarSiActivo(facturaId, tenantId) {
        const FacturaElectronicaRepository = require('../../repositories/Tenant/FacturaElectronicaRepository');
        const config = await FacturacionElectronicaConfigService.getForAdmin(tenantId);
        if (config.estado === 'activo') {
            await FacturaElectronicaRepository.encolar(facturaId, tenantId);
        }
    }

    /**
     * Sincroniza y guarda el rango de numeración activo elegido por el admin.
     * @param {number} tenantId
     * @param {Object} rango - { id, prefijo, desde, hasta, vigencia_hasta }
     */
    static async setNumberingRange(tenantId, rango) {
        await FacturacionElectronicaConfigRepository.upsert(tenantId, {
            numbering_range_id: rango.id || null,
            numbering_range_prefijo: rango.prefijo || null,
            numbering_range_desde: rango.desde || null,
            numbering_range_hasta: rango.hasta || null,
            numbering_range_vigencia_hasta: rango.vigencia_hasta || null
        });
    }

    /**
     * Lista los rangos de numeración disponibles en Factus para el tenant.
     * @param {number} tenantId
     * @returns {Promise<Array>}
     */
    static async listNumberingRanges(tenantId) {
        const creds = await FacturacionElectronicaConfigService.getDecryptedForClient(tenantId);
        if (!creds || !creds.clientId) {
            throw new Error('Debe configurar y guardar las credenciales de Factus primero');
        }
        const client = new FactusClient(creds);
        return client.getNumberingRanges();
    }
}

module.exports = FacturacionElectronicaConfigService;
