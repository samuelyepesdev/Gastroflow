const AsistenteRepository = require('../../../repositories/Tenant/AsistenteRepository');
const ProductRepository = require('../../../repositories/Tenant/ProductRepository');
const { resolverMesa, resolverProducto } = require('../../../utils/asistenteMatching');

/**
 * Traduce el texto dictado a filas reales del tenant. El tenantId siempre viene de la sesión,
 * nunca del texto ni del modelo de lenguaje.
 */
class AsistenteResolverService {
    static async resolverMesa(tenantId, texto) {
        const mesas = await AsistenteRepository.listarMesas(tenantId);
        return resolverMesa(texto, mesas);
    }

    static async resolverProducto(tenantId, texto) {
        // Productos activos del tenant, disponibles o no: el matching distingue ambos casos.
        const productos = await ProductRepository.findAll(tenantId);
        return resolverProducto(texto, productos);
    }
}

module.exports = AsistenteResolverService;
