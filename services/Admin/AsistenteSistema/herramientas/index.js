/** Registro cerrado de herramientas del asistente del sistema: todas de solo lectura. */
module.exports = {
    resumen_plataforma: require('./resumenPlataforma'),
    ventas_plataforma: require('./ventasPlataforma'),
    ventas_restaurante: require('./ventasRestaurante'),
    productos_mas_vendidos: require('./productosMasVendidos'),
    buscar_restaurante: require('./buscarRestaurante'),
    soporte_abierto: require('./soporteAbierto'),
    cola_trabajos: require('./colaTrabajos'),
    planes_y_addons: require('./planesYAddons'),
    uso_asistente: require('./usoAsistente')
};
