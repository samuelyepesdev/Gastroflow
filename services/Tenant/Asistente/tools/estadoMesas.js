const AsistenteRepository = require('../../../../repositories/Tenant/AsistenteRepository');
const { etiquetaMesa } = require('./resolucion');

const grupo = mesas => ({ cantidad: mesas.length, mesas: mesas.map(etiquetaMesa) });

module.exports = {
    tipo: 'lectura',
    permiso: 'mesas.ver',
    modulo: 'mesas',
    descripcion:
        'Resumen de las mesas del salón del restaurante (no cuenta los pedidos de domicilio ni del POS): cuántas hay en total, cuáles están libres y cuáles ocupadas. Úsala para "cuántas mesas hay", "qué mesas están ocupadas" o "cómo está el salón".',
    parametros: { type: 'object', properties: {} },

    async preparar(ctx) {
        const mesas = await AsistenteRepository.listarMesasFisicas(ctx.tenantId);
        const libres = mesas.filter(m => m.estado === 'libre');
        const ocupadas = mesas.filter(m => m.estado === 'ocupada');
        const otras = mesas.filter(m => m.estado !== 'libre' && m.estado !== 'ocupada');
        return {
            tipo: 'resultado',
            datos: { total: mesas.length, libres: grupo(libres), ocupadas: grupo(ocupadas), otras: grupo(otras) }
        };
    }
};
