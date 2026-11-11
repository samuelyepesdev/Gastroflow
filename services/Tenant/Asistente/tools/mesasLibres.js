const AsistenteRepository = require('../../../../repositories/Tenant/AsistenteRepository');
const { etiquetaMesa } = require('./resolucion');

module.exports = {
    tipo: 'lectura',
    permiso: 'mesas.ver',
    modulo: 'mesas',
    descripcion: 'Lista las mesas que están libres en este momento.',
    parametros: { type: 'object', properties: {} },

    async preparar(ctx) {
        const mesas = await AsistenteRepository.listarMesas(ctx.tenantId);
        const libres = mesas.filter(m => m.estado === 'libre');
        return { tipo: 'resultado', datos: { mesas: libres.map(etiquetaMesa), total: libres.length } };
    }
};
