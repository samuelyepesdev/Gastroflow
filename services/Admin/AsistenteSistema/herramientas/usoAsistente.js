const AsistenteAdminService = require('../../AsistenteAdminService');
const { textoSeguro } = require('../seguro');

const TOP = 10;

module.exports = {
    descripcion:
        'Uso del asistente Chef en los últimos 30 días: si el servidor de IA está configurado, cuántos restaurantes lo tienen y los que más lo usan.',
    parametros: { type: 'object', properties: {} },
    async preparar() {
        const { servidor, restaurantes } = await AsistenteAdminService.resumen();
        return {
            servidor,
            restaurantes_con_addon: restaurantes.filter(r => r.addon).length,
            top_uso: [...restaurantes]
                .sort((a, b) => b.usos - a.usos)
                .slice(0, TOP)
                .map(r => ({
                    nombre: textoSeguro(r.nombre),
                    addon: r.addon,
                    comandos: r.usos,
                    errores: r.errores,
                    tokens: r.tokens
                }))
        };
    }
};
