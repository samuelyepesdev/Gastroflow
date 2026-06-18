const POSRepository = require('../../repositories/Tenant/POSRepository');

class POSService {
    static async getProductosForPOS(tenantId) {
        const productos = await POSRepository.getProductosActivos(tenantId);

        const categoriasMap = new Map();
        for (const p of productos) {
            if (p.categoria_id && !categoriasMap.has(p.categoria_id)) {
                categoriasMap.set(p.categoria_id, {
                    id: p.categoria_id,
                    nombre: p.categoria_nombre
                });
            }
        }

        return { productos, categorias: [...categoriasMap.values()] };
    }

    static async getBorradores(tenantId, usuarioId) {
        return POSRepository.getBorradores(tenantId, usuarioId);
    }

    static async saveBorrador(tenantId, usuarioId, data) {
        if (!data.items || !data.items.length) {
            throw new Error('La orden no tiene productos');
        }
        const id = await POSRepository.createBorrador(tenantId, usuarioId, data);
        return { id };
    }

    static async deleteBorrador(id, tenantId) {
        return POSRepository.deleteBorrador(id, tenantId);
    }

    static async getStatsHoy(tenantId) {
        return POSRepository.getStatsHoy(tenantId);
    }
}

module.exports = POSService;
