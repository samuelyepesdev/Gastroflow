/**
 * Registro CERRADO de herramientas del asistente: el modelo solo puede pedir una de estas por nombre.
 * Para agregar una herramienta nueva se crea su archivo y se registra aquí; nada más la expone.
 *
 * Cada herramienta exporta: { tipo: 'lectura'|'escritura', permiso, modulo, descripcion, parametros,
 * preparar(ctx, args) y, si es de escritura, ejecutar(ctx, payload) }.
 */
module.exports = {
    agregar_items: require('./agregarItems'),
    cancelar_item: require('./cancelarItem'),
    liberar_mesa: require('./liberarMesa'),
    consultar_mesa: require('./consultarMesa'),
    mesas_libres: require('./mesasLibres'),
    estado_mesas: require('./estadoMesas'),
    consultar_menu: require('./consultarMenu'),
    ventas_hoy: require('./ventasHoy')
};
