/**
 * ClienteService - Business logic layer for clients
 * Handles client business logic and validation
 * Related to: routes/clientes.js, repositories/ClienteRepository.js
 */

const ClienteRepository = require('../../repositories/Tenant/ClienteRepository');
const { ValidationError, NotFoundError, ConflictError, AppError } = require('../../utils/errors');

class ClienteService {
    /**
     * Get all clients
     * @returns {Promise<Array>} Array of clients
     */
    static async getAll(tenantId) {
        return await ClienteRepository.findAll(tenantId);
    }

    /**
     * Get client by ID (within tenant)
     * @param {number} id - Client ID
     * @param {number} tenantId - Tenant ID
     * @returns {Promise<Object>} Client object
     * @throws {Error} If client not found
     */
    static async getById(id, tenantId) {
        const cliente = await ClienteRepository.findById(id, tenantId);
        if (!cliente) {
            throw new NotFoundError('Cliente no encontrado', 'CLIENTE_NO_ENCONTRADO');
        }
        return cliente;
    }

    /**
     * Search clients (within tenant)
     * @param {string} query - Search term
     * @param {number} tenantId - Tenant ID
     * @returns {Promise<Array>} Array of clients
     */
    static async search(query, tenantId) {
        if (!query || query.trim().length === 0) {
            return [];
        }
        return await ClienteRepository.search(query.trim(), tenantId, 10);
    }

    /**
     * Create a new client (for tenant)
     * @param {number} tenantId - Tenant ID
     * @param {Object} clientData - Client data
     * @returns {Promise<Object>} Created client result
     * @throws {Error} If validation fails
     */
    static async create(tenantId, clientData) {
        const { nombre, direccion, telefono, tipo_documento, numero_documento, email } = clientData;

        if (!nombre || nombre.trim().length === 0) {
            throw new ValidationError('El nombre es requerido', 'CLIENTE_NOMBRE_REQUERIDO');
        }

        const telefonoStr = telefono?.trim() || null;
        if (telefonoStr && !/^\d+$/.test(telefonoStr)) {
            throw new ValidationError('El teléfono solo puede contener números', 'CLIENTE_TELEFONO_INVALIDO');
        }

        const result = await ClienteRepository.create(tenantId, {
            nombre: nombre.trim(),
            direccion: direccion?.trim() || null,
            telefono: telefonoStr,
            tipo_documento: tipo_documento || 'CC',
            numero_documento: numero_documento || null,
            email: email || null
        });

        return {
            id: result.insertId,
            message: 'Cliente creado exitosamente'
        };
    }

    /**
     * Update client by ID (within tenant)
     * @param {number} id - Client ID
     * @param {number} tenantId - Tenant ID
     * @param {Object} clientData - Client data to update
     * @returns {Promise<Object>} Update result
     * @throws {Error} If client not found or validation fails
     */
    static async update(id, tenantId, clientData) {
        const { nombre, direccion, telefono, tipo_documento, numero_documento, email } = clientData;

        if (!nombre || nombre.trim().length === 0) {
            throw new ValidationError('El nombre es requerido', 'CLIENTE_NOMBRE_REQUERIDO');
        }

        const telefonoStr = telefono?.trim() || null;
        if (telefonoStr && !/^\d+$/.test(telefonoStr)) {
            throw new ValidationError('El teléfono solo puede contener números', 'CLIENTE_TELEFONO_INVALIDO');
        }

        const existingClient = await ClienteRepository.findById(id, tenantId);
        if (!existingClient) {
            throw new NotFoundError('Cliente no encontrado', 'CLIENTE_NO_ENCONTRADO');
        }

        const result = await ClienteRepository.update(id, tenantId, {
            nombre: nombre.trim(),
            direccion: direccion?.trim() || null,
            telefono: telefonoStr,
            tipo_documento: tipo_documento || 'CC',
            numero_documento: numero_documento || null,
            email: email || null
        });

        if (result.affectedRows === 0) {
            throw new AppError('No se pudo actualizar el cliente', 500, 'CLIENTE_NO_ACTUALIZADO');
        }

        return { message: 'Cliente actualizado exitosamente' };
    }

    /**
     * Delete client by ID (within tenant)
     * @param {number} id - Client ID
     * @param {number} tenantId - Tenant ID
     * @returns {Promise<Object>} Delete result
     * @throws {Error} If client not found or has associated invoices
     */
    static async delete(id, tenantId) {
        const cliente = await ClienteRepository.findById(id, tenantId);
        if (!cliente) {
            throw new NotFoundError('Cliente no encontrado', 'CLIENTE_NO_ENCONTRADO');
        }

        try {
            const result = await ClienteRepository.delete(id, tenantId);
            if (result.affectedRows === 0) {
                throw new AppError('No se pudo eliminar el cliente', 500, 'CLIENTE_NO_ELIMINADO');
            }
            return { message: 'Cliente eliminado exitosamente' };
        } catch (error) {
            if (error.code === 'ER_ROW_IS_REFERENCED_2') {
                throw new ConflictError(
                    'No se puede eliminar el cliente porque tiene facturas asociadas',
                    'CLIENTE_CON_FACTURAS',
                    {
                        cause: error
                    }
                );
            }
            throw error;
        }
    }
}

module.exports = ClienteService;
