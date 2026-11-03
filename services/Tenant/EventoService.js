/**
 * EventoService - Business logic for events
 */

const EventoRepository = require('../../repositories/Tenant/EventoRepository');

class EventoService {
    static async list(tenantId, filters = {}) {
        return await EventoRepository.findAllByTenant(tenantId, filters);
    }

    /** Lista eventos con resumen de ventas (cantidad_ventas, total_ventas) por evento */
    static async listWithVentasResumen(tenantId, filters = {}) {
        const [eventos, resumen] = await Promise.all([
            EventoRepository.findAllByTenant(tenantId, filters),
            EventoRepository.getVentasResumenPorEvento(tenantId)
        ]);
        const mapResumen = {};
        (resumen || []).forEach(r => {
            mapResumen[r.evento_id] = {
                cantidad_ventas: parseInt(r.cantidad_ventas || 0),
                total_ventas: parseFloat(r.total_ventas || 0)
            };
        });
        return eventos.map(e => ({
            ...e,
            cantidad_ventas: (mapResumen[e.id] && mapResumen[e.id].cantidad_ventas) || 0,
            total_ventas: (mapResumen[e.id] && mapResumen[e.id].total_ventas) || 0
        }));
    }

    static async getById(id, tenantId) {
        return await EventoRepository.findById(id, tenantId);
    }

    static async getActiveForDate(tenantId, date) {
        return await EventoRepository.findActiveByDate(tenantId, date);
    }

    static async create(tenantId, data) {
        if (!data.nombre || !data.fecha_inicio || !data.fecha_fin) {
            throw new Error('Nombre, fecha inicio y fecha fin son obligatorios.');
        }
        if (new Date(data.fecha_fin) < new Date(data.fecha_inicio)) {
            throw new Error('La fecha fin debe ser mayor o igual a la fecha inicio.');
        }
        return await EventoRepository.create(tenantId, data);
    }

    static async update(id, tenantId, data) {
        const event = await EventoRepository.findById(id, tenantId);
        if (!event) {
            throw new Error('Evento no encontrado.');
        }
        if (data.fecha_fin && data.fecha_inicio && new Date(data.fecha_fin) < new Date(data.fecha_inicio)) {
            throw new Error('La fecha fin debe ser mayor o igual a la fecha inicio.');
        }
        await EventoRepository.update(id, tenantId, data);
    }

    static async delete(id, tenantId) {
        // Borrarlo dejaría sus facturas sin evento y pasarían a contar en las ventas normales del restaurante.
        const ventas = await EventoRepository.countVentas(id, tenantId);
        if (ventas > 0) {
            throw new Error(
                `Este evento ya tiene ${ventas} venta${ventas === 1 ? '' : 's'} registrada${ventas === 1 ? '' : 's'} y no se puede eliminar. Desactívalo para dejar de usarlo.`
            );
        }
        const ok = await EventoRepository.delete(id, tenantId);
        if (!ok) {
            throw new Error('Evento no encontrado.');
        }
    }
}

module.exports = EventoService;
