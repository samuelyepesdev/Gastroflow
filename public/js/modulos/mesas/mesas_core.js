// Core shared state and helper functions for Mesas module

window.MesasModule = {
  canvas: null,
  pedidoActual: null,
  isProgrammaticHide: false,
  items: [],
  clienteActual: { id: null, nombre: 'Consumidor Final' },
  descuentosPorItem: {},
  propinaPedido: 0,
  currentMesaEstado: 'libre',

  formatear(valor) {
    return `$${Number(valor || 0).toLocaleString('es-CO')}`;
  },

  subtotalConDescuento(cantidad, precio, itemId) {
    const pct = this.descuentosPorItem[itemId] != null ? this.descuentosPorItem[itemId] : 0;
    return cantidad * precio * (1 - pct / 100);
  },

  async runWithOffcanvasHidden(action) {
    const canvasEl = document.getElementById('canvasPedido');
    const wasOpen = this.canvas && canvasEl?.classList.contains('show');
    if (wasOpen) {
      this.isProgrammaticHide = true;
      await new Promise(resolve => {
        // Escuchar evento oficial de Bootstrap para garantizar sincronía
        const onHidden = () => {
          canvasEl.removeEventListener('hidden.bs.offcanvas', onHidden);
          resolve();
        };
        canvasEl.addEventListener('hidden.bs.offcanvas', onHidden);
        
        try { 
          this.canvas.hide(); 
        } catch (_) { 
          this.isProgrammaticHide = false;
          canvasEl.removeEventListener('hidden.bs.offcanvas', onHidden);
          resolve(); 
        }
      });
    }
    try {
      return await action();
    } finally {
      this.isProgrammaticHide = false;
      if (wasOpen) {
        try { this.canvas.show(); } catch (_) {}
      }
    }
  }
};

$(function () {
  if (document.getElementById('canvasPedido')) {
    window.MesasModule.canvas = new bootstrap.Offcanvas('#canvasPedido');
  }

  // Handle favorites panel body styling classes
  document.getElementById('canvasPedido')?.addEventListener('shown.bs.offcanvas', () => {
    document.body.classList.add('offcanvas-open');
  });
  document.getElementById('canvasPedido')?.addEventListener('hidden.bs.offcanvas', () => {
    document.body.classList.remove('offcanvas-open');
    if (!window.MesasModule.isProgrammaticHide) {
      window.MesasModule.pedidoActual = null;
    }
  });
});

window.refreshMesaIfOpen = async function(mesaId, action) {
  if (window.MesasModule.pedidoActual && window.MesasModule.pedidoActual.mesa_id == mesaId) {
    console.log(`[SSE] Mesa abierta ${mesaId} afectada por acción: ${action}...`);

    if (action === 'billed') {
      // Ocultar todos los modals abiertos para evitar clics de facturación
      $('.modal').each(function() {
        const modalInstance = bootstrap.Modal.getInstance(this);
        if (modalInstance) {
          modalInstance.hide();
        }
      });

      // Cerrar cualquier SweetAlert abierto
      if (typeof Swal !== 'undefined' && typeof Swal.close === 'function') {
        Swal.close();
      }

      // Ocultar panel lateral (offcanvas)
      const canvasEl = document.getElementById('canvasPedido');
      if (canvasEl && window.MesasModule.canvas) {
        window.MesasModule.canvas.hide();
      }

      // Limpiar datos
      window.MesasModule.pedidoActual = null;
      window.MesasModule.items = [];
      window.MesasModule.propinaPedido = 0;
      if (typeof window.MesasModule.renderItems === 'function') {
        window.MesasModule.renderItems();
      }

      Swal.fire({
        icon: 'info',
        title: 'Mesa Facturada',
        text: 'Esta mesa ha sido facturada por otro usuario o dispositivo.',
        timer: 3000
      });

      if (typeof refreshMesas === 'function') refreshMesas();
      return;
    }

    if (action === 'cancelled') {
      // Ocultar todos los modals abiertos
      $('.modal').each(function() {
        const modalInstance = bootstrap.Modal.getInstance(this);
        if (modalInstance) {
          modalInstance.hide();
        }
      });

      // Cerrar cualquier SweetAlert abierto
      if (typeof Swal !== 'undefined' && typeof Swal.close === 'function') {
        Swal.close();
      }

      // Ocultar offcanvas
      const canvasEl = document.getElementById('canvasPedido');
      if (canvasEl && window.MesasModule.canvas) {
        window.MesasModule.canvas.hide();
      }

      window.MesasModule.pedidoActual = null;
      window.MesasModule.items = [];
      window.MesasModule.propinaPedido = 0;
      if (typeof window.MesasModule.renderItems === 'function') {
        window.MesasModule.renderItems();
      }

      Swal.fire({
        icon: 'warning',
        title: 'Pedido Cancelado',
        text: 'El pedido de esta mesa ha sido cancelado.',
        timer: 3000
      });

      if (typeof refreshMesas === 'function') refreshMesas();
      return;
    }

    // Comportamiento por defecto (ej. nuevos productos agregados)
    if (typeof window.MesasModule.cargarPedido === 'function') {
      await window.MesasModule.cargarPedido(window.MesasModule.pedidoActual.id);
    }
    const Toast = Swal.mixin({
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 3000,
      timerProgressBar: true
    });
    Toast.fire({
      icon: 'info',
      title: 'Pedido actualizado',
      text: 'Se han recibido nuevos productos en el pedido.'
    });
  } else {
    if (typeof refreshMesas === 'function') refreshMesas();
  }
};
