/**
 * PlanService - Lógica de planes de suscripción
 */

const PlanRepository = require('../../repositories/Admin/PlanRepository');
const CacheService = require('../Shared/CacheService');

const PLANES_CACHE_KEY = 'planes:activos';

class PlanService {
    /** Listar todos los planes activos */
    static async getAll() {
        // Se consulta en CADA petición autenticada (app.js, navbar): sin caché eran ~1 query/request.
        const cached = CacheService.get(PLANES_CACHE_KEY);
        if (cached) {
            return cached;
        }
        const planes = await PlanRepository.findAll();
        CacheService.set(PLANES_CACHE_KEY, planes, 60);
        return planes;
    }

    /** Obtener plan por ID */
    static async getById(id) {
        return PlanRepository.findById(id);
    }

    /** Obtener plan por slug */
    static async getBySlug(slug) {
        return PlanRepository.findBySlug(slug);
    }

    /**
     * Actualizar los precios de un plan
     * @param {number} id
     * @param {{ precio_pequeno: number, precio_mediano: number, precio_grande: number }} data
     */
    static async updatePrecios(id, data) {
        const plan = await PlanRepository.findById(id);
        if (!plan) {
            throw new Error('Plan no encontrado');
        }
        await PlanRepository.updatePrecios(id, data);
        CacheService.delete(PLANES_CACHE_KEY);
        return PlanRepository.findById(id);
    }

    /**
     * Actualizar datos generales de un plan
     * @param {number} id
     * @param {Object} data
     */
    static async updateGeneral(id, data) {
        const plan = await PlanRepository.findById(id);
        if (!plan) {
            throw new Error('Plan no encontrado');
        }
        await PlanRepository.update(id, data);
        CacheService.delete(PLANES_CACHE_KEY);
        // Los módulos del plan son el techo de permisos del admin de cada restaurante que lo usa
        CacheService.deleteByPrefix('user:ctx:');
        CacheService.deleteByPrefix('tenant:');
        return PlanRepository.findById(id);
    }
}

module.exports = PlanService;
