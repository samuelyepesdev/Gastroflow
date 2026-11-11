const Repo = require('../../../../repositories/Admin/AsistenteSistemaRepository');
const { textoSeguro, num } = require('../seguro');

const MAX_ERROR = 100;

module.exports = {
    descripcion: 'Cola de trabajos en segundo plano (correos, PDF): cuántos hay por estado y los últimos errores.',
    parametros: { type: 'object', properties: {} },
    async preparar() {
        const { porEstado, errores } = await Repo.colaTrabajos();
        const por_estado = {};
        porEstado.forEach(f => {
            por_estado[f.estado] = num(f.cantidad);
        });
        return {
            por_estado,
            errores_recientes: errores.map(e => ({
                tipo: textoSeguro(e.tipo, 40),
                intentos: num(e.intentos),
                error: textoSeguro(e.error, MAX_ERROR),
                fecha: e.updated_at
            }))
        };
    }
};
