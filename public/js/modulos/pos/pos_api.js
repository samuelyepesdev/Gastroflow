// POS API — todas las llamadas HTTP del módulo POS (sobre GF.api).
// Las lecturas accesorias usan getOr: si fallan, el POS sigue funcionando con
// un valor vacío en vez de bloquear la venta.

window.POS_API = {
    getProductos() {
        return GF.api.getOr('/pos/productos', { productos: [], categorias: [] });
    },

    getModificadoresProducto(productoId) {
        return GF.api.getOr(`/pos/productos/${productoId}/modificadores`, []);
    },

    getStats() {
        return GF.api.getOr('/pos/stats', { num_ordenes: 0, total_hoy: 0 });
    },

    getServicios() {
        return GF.api.getOr('/api/servicios/lista', []);
    },

    getBorradores() {
        return GF.api.getOr('/pos/borradores', []);
    },

    saveBorrador(data) {
        return GF.api.post('/pos/borradores', data, 'Error al guardar la orden');
    },

    /** Devuelve true/false (no lanza), igual que antes. */
    deleteBorrador(id, { skipCocina = false } = {}) {
        const url = `/pos/borradores/${id}${skipCocina ? '?skip_cocina=1' : ''}`;
        return GF.api.delete(url).then(
            () => true,
            () => false
        );
    },

    // Abonos a la cuenta de una orden guardada (el pedido de cocina de la orden)
    registrarAbono(pedidoId, datos) {
        return GF.api.post(`/pos/pedidos/${pedidoId}/abonos`, datos, 'Error al registrar el abono');
    },

    getAbonos(pedidoId) {
        return GF.api(`/pos/pedidos/${pedidoId}/abonos`, {}, 'Error al cargar los abonos');
    },

    eliminarAbono(abonoId) {
        return GF.api(`/pos/abonos/${abonoId}`, { method: 'DELETE' }, 'No se pudo eliminar el abono');
    },

    // Ruta propia del POS — no requiere facturas.ver
    crearFactura(payload) {
        return GF.api.post('/pos/vender', payload, 'Error al generar la factura');
    },

    buscarCliente(q) {
        return GF.api.getOr(`/api/clientes/buscar?q=${encodeURIComponent(q)}`, []);
    },

    crearCliente(data) {
        return GF.api.post('/api/clientes', data, 'No se pudo crear el cliente');
    },

    // Ruta propia del POS — no requiere clientes.ver
    getOrCreateConsumidorFinal() {
        return GF.api.getOr('/pos/consumidor-final', { id: null, nombre: 'Consumidor final' });
    }
};
