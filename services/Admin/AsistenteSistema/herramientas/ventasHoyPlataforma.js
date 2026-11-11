const Repo = require('../../../../repositories/Admin/AsistenteSistemaRepository');
const { textoSeguro, num } = require('../seguro');

const TOP = 5;

module.exports = {
    descripcion: 'Ventas de hoy de toda la plataforma: total, número de facturas y los restaurantes que más vendieron.',
    parametros: { type: 'object', properties: {} },
    async preparar() {
        const { fecha, filas } = await Repo.ventasHoy();
        const ventas = filas.map(f => ({
            nombre: textoSeguro(f.nombre),
            total: num(f.total),
            facturas: num(f.facturas)
        }));
        const conVentas = ventas.filter(v => v.total > 0);
        return {
            fecha,
            total: ventas.reduce((s, v) => s + v.total, 0),
            facturas: ventas.reduce((s, v) => s + v.facturas, 0),
            restaurantes_con_ventas: conVentas.length,
            top: conVentas.slice(0, TOP)
        };
    }
};
