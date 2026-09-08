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
  // Marca de tiempo del último abrirPedido y contador de ciclos seguidos en los
  // que /listar reporta la mesa como cerrada. Los usa el vigilante de
  // refreshMesas para no disparar falsos "Mesa Facturada".
  pedidoAbiertoAt: 0,
  cerradaStreak: 0,

  formatear(valor) {
    return `$${Number(valor || 0).toLocaleString('es-CO')}`;
  },

  // Normaliza la entrada de descuentosPorItem a { tipo, valor }.
  // Acepta número suelto (retrocompat = %) o { tipo:'porcentaje'|'valor', valor:N }.
  descuentoNormalizado(itemId) {
    const raw = this.descuentosPorItem[itemId];
    if (raw == null) return { tipo: 'porcentaje', valor: 0 };
    if (typeof raw === 'object') {
      return { tipo: raw.tipo === 'valor' ? 'valor' : 'porcentaje', valor: Math.max(0, Number(raw.valor) || 0) };
    }
    return { tipo: 'porcentaje', valor: Math.max(0, Number(raw) || 0) };
  },

  subtotalConDescuento(cantidad, precio, itemId) {
    const bruto = cantidad * precio;
    const { tipo, valor } = this.descuentoNormalizado(itemId);
    if (tipo === 'valor') {
      return Math.max(0, bruto - Math.min(valor, bruto));
    }
    return bruto * (1 - Math.min(100, valor) / 100);
  },

  // Texto corto para el badge de descuento de un ítem ('' si no tiene).
  descuentoBadge(itemId) {
    const { tipo, valor } = this.descuentoNormalizado(itemId);
    if (valor <= 0) return '';
    return tipo === 'valor' ? '-' + this.formatear(valor) : '-' + valor + '%';
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
        try { this.canvas.show(); } catch (err) { console.warn('No se pudo reabrir el panel:', err); }
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

// Extraída de refreshMesaIfOpen: los eventos 'billed' y 'cancelled' hacían
// exactamente esta misma limpieza, solo cambiaba el ícono y el texto (S3776).
function limpiarMesaPorEventoExterno(icon, title, text) {
  $('.modal').each(function() {
    const modalInstance = bootstrap.Modal.getInstance(this);
    modalInstance?.hide();
  });

  if (typeof Swal !== 'undefined' && typeof Swal.close === 'function') {
    Swal.close();
  }

  const canvasEl = document.getElementById('canvasPedido');
  if (canvasEl && window.MesasModule.canvas) {
    window.MesasModule.canvas.hide();
  }

  window.MesasModule.pedidoActual = null;
  window.MesasModule.items = [];
  window.MesasModule.propinaPedido = 0;
  window.MesasModule.cerradaStreak = 0;
  if (typeof window.MesasModule.renderItems === 'function') {
    window.MesasModule.renderItems();
  }

  Swal.fire({ icon, title, text, timer: 3000 });

  if (typeof refreshMesas === 'function') refreshMesas();
}

window.refreshMesaIfOpen = async function(mesaId, action) {
  if (window.MesasModule.pedidoActual?.mesa_id == mesaId) {
    console.log(`[SSE] Mesa abierta ${mesaId} afectada por acción: ${action}...`);

    if (action === 'billed') {
      limpiarMesaPorEventoExterno('info', 'Mesa Facturada', 'Esta mesa ha sido facturada por otro usuario o dispositivo.');
      return;
    }

    if (action === 'cancelled') {
      limpiarMesaPorEventoExterno('warning', 'Pedido Cancelado', 'El pedido de esta mesa ha sido cancelado.');
      return;
    }

    // Comportamiento por defecto (ej. nuevos productos agregados)
    if (typeof window.MesasModule.cargarPedido === 'function') {
      await window.MesasModule.cargarPedido(window.MesasModule.pedidoActual.id);
    }
    const Toast = Swal.mixin({
      toast: true,
      position: 'bottom-end',
      showConfirmButton: false,
      timer: 1500,
      timerProgressBar: false
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
