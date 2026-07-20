// Core states and storage for Facturas module

window.FacturasModule = {
  pedidosGuardados: JSON.parse(localStorage.getItem('pedidos') || '[]'),
  productosFactura: [],
  totalFactura: 0,
  timeoutCliente: null,
  timeoutProducto: null,
  currentStep: 1,

  guardarSesionProvisional() {
    const sesion = {
      productos: this.productosFactura,
      clienteId: $('#cliente_id').val(),
      clienteNombre: $('#cliente').val(),
      direccion: $('#direccionCliente').text(),
      telefono: $('#telefonoCliente').text()
    };
    localStorage.setItem('pos_sesion_provisional', JSON.stringify(sesion));
  },

  cargarSesionProvisional() {
    const data = localStorage.getItem('pos_sesion_provisional');
    if (!data) return;
    try {
      const sesion = JSON.parse(data);
      if (sesion.productos?.length > 0) {
        this.productosFactura = sesion.productos;
        if (typeof this.actualizarTablaProductos === 'function') this.actualizarTablaProductos();
      }
      if (sesion.clienteId && typeof window.seleccionarCliente === 'function') {
        window.seleccionarCliente({
          id: sesion.clienteId,
          nombre: sesion.clienteNombre,
          direccion: sesion.direccion,
          telefono: sesion.telefono
        });
      }
    } catch (e) { console.error("Error cargando sesión provisional", e); }
  },

  limpiarSesionProvisional() {
    localStorage.removeItem('pos_sesion_provisional');
  },

  actualizarLocalStorage() {
    localStorage.setItem('pedidos', JSON.stringify(this.pedidosGuardados));
  },

  getOrCreateConsumidorFinal() {
    return fetch('/api/clientes/buscar?q=consumidor%20final')
      .then(r => r.json())
      .then(list => {
        let cf = (list || []).find(c => (c.nombre || '').toLowerCase() === 'consumidor final');
        if (cf) return cf;
        return fetch('/api/clientes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre: 'Consumidor final' })
        }).then(r => r.ok ? r.json() : null);
      }).catch(() => null);
  },

  subtotalLinea(item) {
    return item.cantidad * item.precio * (1 - (item.descuento_porcentaje || 0) / 100);
  }
};
