/**
 * AddonService - Lógica de negocio para add-ons
 * Intermediario entre rutas y AddonRepository.
 * Related to: repositories/AddonRepository.js, routes/admin/planes.js
 */

const AddonRepository = require('../../repositories/Admin/AddonRepository');
const PlanRepository = require('../../repositories/Admin/PlanRepository');
const db = require('../../config/database');
const CacheService = require('../Shared/CacheService');

class AddonService {
    /** Listar todos los add-ons del catálogo */
    static async getAll() {
        return AddonRepository.findAll();
    }

    /** Actualizar precio/nombre de un add-on */
    static async update(id, data) {
        const addon = await AddonRepository.findById(id);
        if (!addon) {
            throw new Error('Add-on no encontrado');
        }
        await AddonRepository.update(id, data);
        return AddonRepository.findById(id);
    }

    /** Add-ons asignados a un tenant */
    static async getByTenant(tenantId) {
        return AddonRepository.getByTenant(tenantId);
    }

    /** Asignar add-on a un tenant */
    static async addToTenant(tenantId, addonId) {
        const addon = await AddonRepository.findById(addonId);
        if (!addon) {
            throw new Error('Add-on no encontrado');
        }
        await AddonRepository.addToTenant(tenantId, addonId);
        CacheService.delete(`addons:${tenantId}`);
    }

    /** Quitar add-on de un tenant */
    static async removeFromTenant(tenantId, addonId) {
        await AddonRepository.removeFromTenant(tenantId, addonId);
        CacheService.delete(`addons:${tenantId}`);
    }

    /**
     * Calcular el precio total mensual a cobrar a un tenant:
     * precio del plan según su tamaño + suma de add-ons activos
     * @param {number} tenantId
     * @param {number|null} planId     — si null se obtiene de la BD
     * @param {string|null} tamano     — 'pequeno'|'mediano'|'grande'
     * @returns {Promise<{ plan: number, addons: number, total: number }>}
     */
    static async calcularTotalTenant(tenantId, planId, tamano) {
        // Precio del plan
        let precioPlan = 0;
        if (planId) {
            const plan = await PlanRepository.findById(planId);
            if (plan) {
                const key = `precio_${tamano || 'pequeno'}`;
                precioPlan = plan[key] || 0;
            }
        }
        // Suma de add-ons
        const addons = await AddonRepository.getByTenant(tenantId);
        const precioAddons = addons.reduce((sum, a) => sum + (a.precio || 0), 0);
        return {
            plan: precioPlan,
            addons: precioAddons,
            total: precioPlan + precioAddons
        };
    }

    /**
     * Actualizar el tamaño del tenant
     * @param {number} tenantId
     * @param {'pequeno'|'mediano'|'grande'} tamano
     */
    static async updateTamano(tenantId, tamano) {
        const validos = ['pequeno', 'mediano', 'grande'];
        if (!validos.includes(tamano)) {
            throw new Error('Tamaño inválido');
        }
        await db.query('UPDATE tenants SET tamano = ? WHERE id = ?', [tamano, tenantId]);
        CacheService.delete(`tenant:${tenantId}`);
    }

    /**
     * Datos enriquecidos de todos los tenants: plan, tamaño, add-ons y precio total
     * @param {Object[]} tenants
     * @param {Object[]} plans
     * @returns {Promise<Object[]>}
     */
    static async enrichTenants(tenants, plans) {
        if (!tenants || tenants.length === 0) {
            return [];
        }
        const tenantIds = tenants.map(t => t.id);
        const addonRows = await AddonRepository.getByTenantIds(tenantIds);
        const planMap = Object.fromEntries(plans.map(p => [p.id, p]));

        // Agrupar add-ons por tenant_id
        const addonsByTenant = {};
        addonRows.forEach(row => {
            if (!addonsByTenant[row.tenant_id]) {
                addonsByTenant[row.tenant_id] = [];
            }
            addonsByTenant[row.tenant_id].push({
                id: row.addon_id,
                slug: row.addon_slug,
                nombre: row.addon_nombre,
                precio: parseFloat(row.addon_precio || 0)
            });
        });

        return tenants.map(t => {
            const plan = planMap[t.plan_id] || null;
            const tamano = t.tamano || 'pequeno';
            const addons = addonsByTenant[t.id] || [];
            const keyPlan = `precio_${tamano}`;
            const precioPlan = plan ? plan[keyPlan] || 0 : 0;
            const precioAddons = addons.reduce((s, a) => s + a.precio, 0);
            return {
                ...t,
                plan_nombre: plan ? plan.nombre : 'Sin plan',
                plan_slug: plan ? plan.slug : '',
                tamano,
                addons,
                precio_plan: precioPlan,
                precio_addons: precioAddons,
                precio_total: precioPlan + precioAddons
            };
        });
    }
}

module.exports = AddonService;
