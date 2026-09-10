/**
 * CocinaService - Business logic layer for kitchen
 * Handles kitchen queue business logic
 * Related to: routes/cocina.js, repositories/CocinaRepository.js
 */

const CocinaRepository = require('../../repositories/Tenant/CocinaRepository');

class CocinaService {
    /**
     * Get kitchen queue
     * @returns {Promise<Array>} Array of kitchen items
     */
    static async getQueue(tenantId) {
        return await CocinaRepository.getQueue(tenantId);
    }

    /**
     * Update item state in kitchen (item must belong to tenant)
     * @param {number} id - Item ID
     * @param {number} tenantId - Tenant ID
     * @param {string} estado - New state ('preparando' or 'listo')
     * @returns {Promise<Object>} Update result
     * @throws {Error} If invalid state or item not found
     */
    static async updateItemEstado(id, tenantId, estado) {
        const permitidos = ['preparando', 'listo'];
        if (!permitidos.includes(estado)) {
            throw new Error('Estado inválido');
        }

        const result = await CocinaRepository.updateItemEstado(id, tenantId, estado);
        if (result.affectedRows === 0) {
            throw new Error('Item no encontrado o en estado no válido');
        }

        return { message: 'Estado actualizado' };
    }

    static async updateGroupEstado(tenantId, productoNombre, nota, estado, modificadoresHash) {
        const permitidos = ['preparando', 'listo'];
        if (!permitidos.includes(estado)) {
            throw new Error('Estado inválido');
        }

        return await CocinaRepository.updateGroupEstado(tenantId, productoNombre, nota, estado, modificadoresHash);
    }

    /**
     * Completa (cierra) un pedido de mostrador del POS y lo saca de la cola de cocina.
     * @throws {Error} Si el pedido no existe o no es un pedido de POS (origen='caja')
     */
    static async completarPedidoPOS(pedidoId, tenantId) {
        const pedido = await CocinaRepository.completarPedidoPOS(pedidoId, tenantId);
        if (!pedido) {
            throw new Error('Pedido no encontrado');
        }

        try {
            const RealtimeEvents = require('../Shared/RealtimeEvents');
            RealtimeEvents.emit('orderCreated', {
                tenantId,
                pedidoId: pedido.id,
                mesaId: pedido.mesa_id,
                action: 'billed'
            });
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Error al emitir evento SSE al completar pedido POS:', err);
        }

        return { message: 'Pedido completado' };
    }

    /**
     * Cancela (best-effort) el pedido de cocina de una orden del POS que se elimina.
     * No lanza si el pedido no existe: quien llama (eliminar borrador) no debe fallar
     * por esto — devuelve null en ese caso.
     */
    static async cancelarPedidoPOS(pedidoId, tenantId) {
        const pedido = await CocinaRepository.cancelarPedidoPOS(pedidoId, tenantId);
        if (!pedido) {
            return null;
        }

        try {
            const POSRepository = require('../../repositories/Tenant/POSRepository');
            await POSRepository.deleteBorradorPorPedidoCocina(pedido.id, tenantId);
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Error al borrar borrador POS asociado al cancelar desde cocina:', err);
        }

        try {
            const RealtimeEvents = require('../Shared/RealtimeEvents');
            RealtimeEvents.emit('orderCreated', {
                tenantId,
                pedidoId: pedido.id,
                mesaId: pedido.mesa_id,
                action: 'cancelled'
            });
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Error al emitir evento SSE al cancelar pedido POS:', err);
        }

        return pedido;
    }
}

module.exports = CocinaService;
