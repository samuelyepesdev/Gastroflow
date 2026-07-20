// Actions, Wizard, Client lookup, Tips, and QRs for Mesas module

$(function () {
  const mod = window.MesasModule;

  // Botón "Aplicar descuento"
  $('#btnAplicarDescuentoMesa').on('click', function () {
    if (mod.items.length === 0) {
      Swal.fire({ icon: 'warning', title: 'No hay productos en el pedido', text: 'Agregue productos para aplicar un descuento.' });
      return;
    }
    const $lista = $('#descuentoMesaListaProductos');
    $lista.empty();
    mod.items.forEach(function (it) {
      const nombre = it.producto_nombre || it.nombre || it.producto_id || 'Producto';
      const cantidad = Number(it.cantidad || 0);
      const precio = Number((it.precio_unitario != null ? it.precio_unitario : it.precio) || 0);
      const subtotal = mod.subtotalConDescuento(cantidad, precio, it.id);
      const descTexto = (mod.descuentosPorItem[it.id] != null && mod.descuentosPorItem[it.id] > 0) ? ' <span class="badge bg-success">-' + mod.descuentosPorItem[it.id] + '%</span>' : '';
      const $a = $('<a href="#" class="list-group-item list-group-item-action"></a>')
        .html('<div><strong>' + nombre + '</strong>' + descTexto + '</div><div class="small text-muted">Cant: ' + cantidad + ' · ' + mod.formatear(subtotal) + '</div>')
        .on('click', function (e) { e.preventDefault(); elegirProductoParaDescuento(it.id, nombre); });
      $lista.append($a);
    });
    $('#descuentoModalMesaTitulo').text('Seleccione el producto');
    $('#descuentoMesaPaso1').show();
    $('#descuentoMesaPaso2').hide();
    new bootstrap.Modal(document.getElementById('descuentoModalMesa')).show();
  });

  function elegirProductoParaDescuento(itemId, nombre) {
    window._descuentoItemIdMesa = itemId;
    const it = mod.items.find(i => i.id === itemId);
    const subtotal = it ? mod.formatear(mod.subtotalConDescuento(Number(it.cantidad || 0), Number((it.precio_unitario != null ? it.precio_unitario : it.precio) || 0), itemId)) : '$0';
    $('#descuentoModalProductoMesa').text(nombre + ' — ' + subtotal);
    $('#descuentoModalMesaTitulo').text('Aplicar descuento');
    $('#descuentoMesaPaso1').hide();
    $('#descuentoMesaPaso2').show();
  }

  $(document).on('click', '.btn-descuento-mesa', function () {
    const pct = Number.parseInt($(this).data('pct'), 10);
    const itemId = window._descuentoItemIdMesa;
    if (itemId != null) { mod.descuentosPorItem[itemId] = pct; mod.renderItems(); }
    bootstrap.Modal.getInstance(document.getElementById('descuentoModalMesa')).hide();
  });
  
  $('#quitarDescuentoMesaBtn').on('click', function () {
    const itemId = window._descuentoItemIdMesa;
    if (itemId != null) { delete mod.descuentosPorItem[itemId]; mod.renderItems(); }
    bootstrap.Modal.getInstance(document.getElementById('descuentoModalMesa')).hide();
  });

  // Botón "Propina"
  $('#btnPropinaMesa').on('click', function () {
    if (!mod.pedidoActual || !mod.pedidoActual.id) {
      Swal.fire({ icon: 'warning', title: 'No hay pedido abierto' });
      return;
    }
    $('#propinaInputMesa').val(mod.propinaPedido > 0 ? mod.propinaPedido : '');
    new bootstrap.Modal(document.getElementById('propinaModalMesa')).show();
  });
  
  $('.btn-propina-rapida').on('click', function () {
    const val = Number($(this).data('val')) || 0;
    $('#propinaInputMesa').val(val);
  });
  
  $('#aplicarPropinaMesaBtn').on('click', async function () {
    const valor = Math.max(0, Number.parseFloat($('#propinaInputMesa').val()) || 0);
    try {
      const r = await fetch(`/api/mesas/pedidos/${mod.pedidoActual.id}/propina`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propina: valor })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Error');
      mod.propinaPedido = valor;
      mod.renderItems();
      bootstrap.Modal.getInstance(document.getElementById('propinaModalMesa')).hide();
      if (valor > 0) Swal.fire({ icon: 'success', title: 'Propina aplicada', text: mod.formatear(valor), timer: 1500, showConfirmButton: false });
    } catch (e) { Swal.fire({ icon: 'error', title: e.message }); }
  });
  
  $('#quitarPropinaMesaBtn').on('click', async function () {
    try {
      const r = await fetch(`/api/mesas/pedidos/${mod.pedidoActual.id}/propina`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propina: 0 })
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Error'); }
      mod.propinaPedido = 0;
      $('#propinaInputMesa').val('');
      mod.renderItems();
      bootstrap.Modal.getInstance(document.getElementById('propinaModalMesa')).hide();
    } catch (e) { Swal.fire({ icon: 'error', title: e.message }); }
  });

  // Client Search & Assigning
  const modalClienteMesa = new bootstrap.Modal(document.getElementById('modalBuscarClienteMesa'));
  $('#btnBuscarClienteMesa').on('click', function () {
    modalClienteMesa.show();
    setTimeout(() => $('#buscarClienteInputMesa').focus(), 500);
  });

  $('#btnResetClienteDefault').on('click', async function () {
    const originalCliente = { ...mod.clienteActual };
    mod.clienteActual = { id: null, nombre: 'Consumidor Final' };

    if (mod.pedidoActual && mod.pedidoActual.id) {
      try {
        await fetch(`/api/mesas/pedidos/${mod.pedidoActual.id}/cliente`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cliente_id: null })
        });
      } catch (err) {
        console.error(err);
        mod.clienteActual = originalCliente;
        return Swal.fire({ icon: 'error', title: 'Error al resetear cliente' });
      }
    }

    mod.actualizarUICliente();
    modalClienteMesa.hide();
    $('#buscarClienteInputMesa').val('');
  });

  let toCliente;
  $('#buscarClienteInputMesa').on('input', function () {
    clearTimeout(toCliente);
    const q = this.value.trim();
    const list = $('#resultadosClienteMesa');
    const loader = $('#loadingClienteMesa');

    if (q.length < 2) {
      list.html(`
        <div class="text-center py-4 text-muted">
            <i class="bi bi-keyboard fs-1 d-block mb-2"></i>
            <small>Escriba al menos 2 caracteres para buscar</small>
        </div>
      `).show();
      loader.hide();
      return;
    }

    loader.show();
    list.hide();

    toCliente = setTimeout(async () => {
      try {
        const resp = await fetch(`/api/clientes/buscar?q=${encodeURIComponent(q)}`);
        if (!resp.ok) {
          loader.hide();
          list.html('<div class="list-group-item text-danger text-center">No se pudo buscar</div>').show();
          return;
        }

        const clientes = await resp.json();
        list.empty();
        loader.hide();
        list.show();

        if (clientes.length === 0) {
          list.append('<div class="list-group-item text-muted text-center py-3">Sin resultados</div>');
        } else {
          clientes.forEach(c => {
            const docInfo = c.numero_documento ? `${c.tipo_documento || 'DOC'}: ${c.numero_documento}` : 'Sin documento';
            const item = $(`
              <a href="#" class="list-group-item list-group-item-action py-3 border-bottom">
                <div class="d-flex justify-content-between align-items-center">
                  <div>
                      <div class="fw-bold text-dark">${c.nombre}</div>
                      <div class="small text-muted">${docInfo}</div>
                  </div>
                  <i class="bi bi-chevron-right text-muted"></i>
                </div>
              </a>`);
            item.on('click', async e => {
              e.preventDefault();
              const originalCliente = { ...mod.clienteActual };
              mod.clienteActual = { id: c.id, nombre: c.nombre };

              if (mod.pedidoActual && mod.pedidoActual.id) {
                try {
                  const r = await fetch(`/api/mesas/pedidos/${mod.pedidoActual.id}/cliente`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cliente_id: c.id })
                  });
                  if (!r.ok) throw new Error('No se pudo asociar el cliente');
                } catch (err) {
                  mod.clienteActual = originalCliente;
                  return Swal.fire({ icon: 'error', title: 'Error al asociar cliente' });
                }
              }

              mod.actualizarUICliente();
              modalClienteMesa.hide();
              $('#buscarClienteInputMesa').val('');
              list.empty();
            });
            list.append(item);
          });
        }
      } catch (_) {
        loader.hide();
        list.html('<div class="list-group-item text-danger text-center py-3">Error de red o servidor</div>').show();
      }
    }, 250);
  });

  $(document).on('click', function (e) {
    if (!$(e.target).closest('#buscarClienteInputMesa, #resultadosClienteMesa, #btnBuscarClienteMesa').length) {
      $('#resultadosClienteMesa').hide();
    }
  });

  // Mover pedido
  async function handleMoverMesa() {
    if (!mod.pedidoActual || mod.items.length === 0) {
      return Swal.fire({ icon: 'warning', title: 'No hay productos para mover' });
    }
    try {
      const result = await Swal.fire({
        title: 'Mover Pedido',
        text: '¿Qué desea realizar?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: '<i class="bi bi-grid-fill me-2"></i>Mover toda la mesa',
        denyButtonText: '<i class="bi bi-check-square me-2"></i>Elegir productos',
        showDenyButton: true,
        cancelButtonText: 'Cancelar'
      });
      if (result.isDismissed) return;

      const esParcial = result.isDenied;
      let itemIdsParaMover = [];

      if (esParcial) {
        let htmlItems = '<div class="list-group text-start shadow-sm" style="max-height: 350px; overflow-y: auto;">';
        mod.items.forEach(it => {
          htmlItems += `
            <label class="list-group-item list-group-item-action d-flex align-items-center">
              <input class="form-check-input me-3 item-to-move" type="checkbox" value="${it.id}" style="width: 1.5rem; height: 1.5rem;">
              <div class="flex-grow-1">
                <div class="fw-bold">${it.producto_nombre || it.nombre}</div>
                <div class="small text-muted">Cantidad: ${it.cantidad} — ${mod.formatear(it.subtotal)}</div>
              </div>
            </label>`;
        });
        htmlItems += '</div>';

        const { value: selected } = await mod.runWithOffcanvasHidden(async () => {
          return await Swal.fire({
            title: 'Seleccione productos',
            html: htmlItems,
            showCancelButton: true,
            confirmButtonText: 'Continuar',
            cancelButtonText: 'Atrás',
            preConfirm: () => {
              const checked = Array.from(document.querySelectorAll('.item-to-move:checked')).map(el => el.value);
              if (checked.length === 0) {
                Swal.showValidationMessage('Seleccione al menos un producto');
              }
              return checked;
            }
          });
        });
        if (!selected) return;
        itemIdsParaMover = selected;
      }

      const resp = await fetch('/api/mesas/listar');
      const todasLasMesas = await resp.json();
      let mesasDisponibles;
      if (esParcial) {
        mesasDisponibles = todasLasMesas.filter(m => Number(m.id) !== Number(mod.pedidoActual.mesa_id));
      } else {
        mesasDisponibles = todasLasMesas.filter(m => Number(m.pedidos_abiertos || 0) === 0 && Number(m.id) !== Number(mod.pedidoActual.mesa_id));
      }

      if (mesasDisponibles.length === 0) {
        return Swal.fire({ icon: 'info', title: 'No hay mesas disponibles' });
      }

      const options = mesasDisponibles.reduce((acc, m) => {
        const estadoLabel = m.estado === 'ocupada' ? ' (Ocupada - Se mezclará)' : '';
        acc[m.id] = `Mesa ${m.numero}${m.descripcion ? ' - ' + m.descripcion : ''}${estadoLabel}`;
        return acc;
      }, {});

      const { value: destinoId } = await mod.runWithOffcanvasHidden(async () => {
        return await Swal.fire({
          title: 'Seleccione mesa destino',
          input: 'select',
          inputOptions: options,
          inputPlaceholder: 'Elija la mesa...',
          showCancelButton: true,
          confirmButtonText: 'Confirmar Traslado',
          cancelButtonText: 'Cancelar'
        });
      });
      if (!destinoId) return;

      Swal.fire({ title: 'Procesando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

      let endpoint, method, body;
      if (esParcial) {
        endpoint = `/api/mesas/pedidos/${mod.pedidoActual.id}/mover-items`;
        method = 'POST';
        body = JSON.stringify({ itemIds: itemIdsParaMover, mesa_destino_id: Number(destinoId) });
      } else {
        endpoint = `/api/mesas/pedidos/${mod.pedidoActual.id}/mover`;
        method = 'PUT';
        body = JSON.stringify({ mesa_destino_id: Number(destinoId) });
      }

      const r = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'No se pudo realizar el traslado');

      await mod.cargarPedido(mod.pedidoActual.id);
      Swal.fire({
        icon: 'success',
        title: '¡Completado!',
        text: esParcial ? 'Productos trasladados correctamente.' : 'Pedido movido exitosamente.',
        timer: 2000
      });
      if (typeof refreshMesas === 'function') refreshMesas();
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    }
  }

  $('#btnMoverMesa').on('click', handleMoverMesa);
  $('#btnMoverMesaHeader').on('click', handleMoverMesa);

  // Enviar a cocina
  $('#btnEnviarCocina').on('click', async function () {
    try {
      const pendientes = mod.items.filter(i => i.estado === 'pendiente');
      for (const it of pendientes) {
        await fetch(`/api/mesas/items/${it.id}/enviar`, { method: 'PUT' });
      }
      await mod.cargarPedido(mod.pedidoActual.id);
      Swal.fire({ icon: 'success', title: 'Enviado a cocina' });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'No se pudo enviar a cocina' });
    }
  });

  // Agregar servicios
  const modalServicios = new bootstrap.Modal('#modalServiciosMesa');
  $('#btnAgregarServicioMesa').on('click', async function() {
    if (!mod.pedidoActual || !mod.pedidoActual.id) return;
    modalServicios.show();
    await cargarServiciosDisponibles();
  });

  async function cargarServiciosDisponibles() {
    try {
      const container = $('#listaServiciosDisponibles');
      container.html('<div class="text-center py-4"><div class="spinner-border spinner-border-sm text-primary"></div></div>');
      
      const r = await fetch('/api/servicios/lista');
      const servicios = await r.json();
      
      container.empty();
      if (servicios.length === 0) {
        container.html('<div class="p-4 text-center text-muted small">No hay servicios activos</div>');
        return;
      }

      servicios.forEach(s => {
        container.append(`
          <button type="button" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-3 btn-seleccionar-servicio" 
                  data-id="${s.id}" data-precio="${s.precio}" data-nombre="${s.nombre}">
            <div>
              <div class="fw-bold">${s.nombre}</div>
              <div class="text-muted small">${s.descripcion || ''}</div>
            </div>
            <div class="badge bg-primary rounded-pill">$${Number(s.precio).toLocaleString()}</div>
          </button>
        `);
      });
    } catch (e) {
      $('#listaServiciosDisponibles').html('<div class="p-4 text-center text-danger small">Error al cargar servicios</div>');
    }
  }

  $(document).on('click', '.btn-seleccionar-servicio', async function() {
    const id = $(this).data('id');
    const precio = $(this).data('precio');
    const nombre = $(this).data('nombre');
    
    try {
      modalServicios.hide();
      Utils.showLoading('Agregando servicio...');
      
      const r = await fetch(`/api/mesas/pedidos/${mod.pedidoActual.id}/servicios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          servicio_id: id,
          cantidad: 1,
          precio: precio,
          nota: 'Servicio agregado'
        })
      });

      const data = await r.json();
      Utils.hideLoading();

      if (!r.ok) throw new Error(data.error || 'Error al agregar servicio');
      
      await mod.cargarPedido(mod.pedidoActual.id);
      AlertManager.success(`Servicio "${nombre}" agregado`);
    } catch (e) {
      Utils.hideLoading();
      AlertManager.error(e.message);
    }
  });
});
