const Repo = require('../../../../repositories/Admin/AsistenteSistemaRepository');
const { textoSeguro, num } = require('../seguro');

module.exports = {
    descripcion:
        'Estado del soporte técnico: tickets abiertos, conteo por estado y los tickets abiertos más antiguos (sin su contenido).',
    parametros: { type: 'object', properties: {} },
    async preparar() {
        const { porEstado, antiguos } = await Repo.soporte();
        const por_estado = {};
        porEstado.forEach(f => {
            por_estado[f.estado] = (por_estado[f.estado] || 0) + num(f.cantidad);
        });
        // El texto de los tickets lo escriben los usuarios: se devuelven solo campos de sistema.
        return {
            abiertos: por_estado.abierto || 0,
            por_estado,
            mas_antiguos: antiguos.map(t => ({
                id: t.id,
                tipo: textoSeguro(t.tipo, 20),
                restaurante: textoSeguro(t.restaurante || ''),
                desde: t.created_at
            }))
        };
    }
};
