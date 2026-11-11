const Repo = require('../../../../repositories/Admin/AsistenteSistemaRepository');
const { num } = require('../seguro');

module.exports = {
    descripcion:
        'Resumen de la plataforma: cuántos restaurantes hay, activos, suspendidos por pago, pendientes de aprobación y sucursales, y cuántos usuarios activos.',
    parametros: { type: 'object', properties: {} },
    async preparar() {
        const r = await Repo.resumenPlataforma();
        return {
            restaurantes: {
                total: num(r.total),
                activos: num(r.activos),
                inactivos: num(r.inactivos),
                suspendidos_por_pago: num(r.suspendidos_por_pago),
                pendientes_aprobacion: num(r.pendientes_aprobacion),
                sucursales: num(r.sucursales)
            },
            usuarios_activos: num(r.usuarios_activos)
        };
    }
};
