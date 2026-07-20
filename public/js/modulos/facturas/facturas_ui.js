// Rendering and UI events for Facturas module

$(function () {
  const mod = window.FacturasModule;

  mod.actualizarTablaProductos = function() {
    const tbody = $('#productosTabla').empty();
    mod.totalFactura = 0;
    if (!mod.productosFactura.length) {
      tbody.append('<tr><td colspan="6" class="empty-state" style="padding:3.5rem 2rem;"><i class="bi bi-cart-x"></i><div class="fw-semibold mt-2">Sin productos en la venta</div><small class="text-muted d-block mt-1">Escribe en el buscador de arriba para agregar productos</small></td></tr>');
      $('#productosListaMobile').html('<div class="empty-state py-4"><i class="bi bi-cart-x"></i><div class="fw-semibold mt-2">Sin productos</div><small class="text-muted d-block mt-1">Usa el buscador para agregar</small></div>');
      $('#totalFactura').text('0.00');
      return;
    }
    mod.productosFactura.forEach((it, idx) => {
      it.subtotal = mod.subtotalLinea(it);
      mod.totalFactura += it.subtotal;
      tbody.append(`<tr>
        <td>${it.nombre} ${it.descuento_porcentaje > 0 ? `<span class="badge bg-success">-${it.descuento_porcentaje}%</span>` : ''}</td>
        <td class="text-center text-nowrap">
          <button class="btn btn-sm btn-outline-secondary" onclick="cambiarCant(${idx},-1)"><i class="bi bi-dash"></i></button>
          <input type="number" class="form-control form-control-sm text-center d-inline-block mx-1" style="width: 70px;" value="${it.cantidad}" onchange="setCant(${idx}, this.value)" min="1">
          <button class="btn btn-sm btn-outline-secondary" onclick="cambiarCant(${idx},1)"><i class="bi bi-plus"></i></button>
        </td>
        <td>${it.unidad}</td>
        <td class="text-end">$${it.precio.toLocaleString('es-CO')}</td>
        <td class="text-end">$${it.subtotal.toLocaleString('es-CO')}</td>
        <td class="text-center">
          <button class="btn btn-sm btn-outline-primary" onclick="abrirModalDescuento(${idx})"><i class="bi bi-percent"></i></button>
          <button class="btn btn-sm btn-outline-danger" onclick="eliminarProducto(${idx})"><i class="bi bi-trash"></i></button>
        </td>
      </tr>`);
    });
    actualizarMobile();
    $('#totalFactura').text(mod.totalFactura.toLocaleString('es-CO'));
    mod.guardarSesionProvisional();
  };

  function actualizarMobile() {
    let html = '';
    mod.productosFactura.forEach((it, idx) => {
      html += `<div class="producto-mobile-card p-2 mb-2 bg-white border rounded">
        <div class="fw-bold small">${it.nombre}</div>
        <div class="d-flex align-items-center gap-2 my-1">
          <button class="btn btn-sm btn-outline-secondary" onclick="cambiarCant(${idx},-1)"><i class="bi bi-dash"></i></button>
          <input type="number" class="form-control form-control-sm text-center d-inline-block" style="width: 60px;" value="${it.cantidad}" onchange="setCant(${idx}, this.value)" min="1">
          <button class="btn btn-sm btn-outline-secondary" onclick="cambiarCant(${idx},1)"><i class="bi bi-plus"></i></button>
        </div>
        <div class="small text-muted">Unit. $${it.precio.toLocaleString('es-CO')} | Sub. $${it.subtotal.toLocaleString('es-CO')}</div>
        <div class="d-flex gap-1 mt-2">
          <button class="btn btn-sm btn-outline-primary flex-grow-1" onclick="abrirModalDescuento(${idx})"><i class="bi bi-percent"></i></button>
          <button class="btn btn-sm btn-outline-danger" onclick="eliminarProducto(${idx})"><i class="bi bi-trash"></i></button>
        </div>
      </div>`;
    });
    $('#productosListaMobile').html(html);
  }

  window.cambiarCant = (idx, c) => {
    const it = mod.productosFactura[idx];
    it.cantidad = Math.max(0, it.cantidad + c);
    if (it.cantidad === 0) mod.productosFactura.splice(idx, 1);
    mod.actualizarTablaProductos();
  };

  window.setCant = (idx, val) => {
    const it = mod.productosFactura[idx];
    const v = Number.parseInt(val, 10);
    if (Number.isNaN(v) || v <= 0) {
      it.cantidad = 1;
    } else {
      it.cantidad = v;
    }
    mod.actualizarTablaProductos();
  };

  window.eliminarProducto = idx => { mod.productosFactura.splice(idx, 1); mod.actualizarTablaProductos(); };

  window.seleccionarCliente = function(cliente) {
    if (!cliente || !cliente.id) return;
    $('#cliente').val(cliente.nombre);
    $('#cliente_id').val(cliente.id);
    $('#direccionCliente').text(cliente.direccion || 'No especificada');
    $('#telefonoCliente').text(cliente.telefono || 'No especificado');
    $('#infoCliente').slideDown();
    mod.guardarSesionProvisional();
    if (typeof window.updateStepIndicator === 'function') {
      window.updateStepIndicator(1, true);
      window.updateStepIndicator(2, false);
    }
  };

  function mostrarListaClientes(clientes) {
    const $container = $('#cliente').closest('.search-container');
    $container.find('.search-results').remove();
    const $lista = $('<div class="search-results active" style="z-index: 9999%;">');
    clientes.forEach(cliente => {
      $('<a href="#" class="search-item">')
        .append($('<div class="item-info">').append($('<span class="item-name">').text(cliente.nombre), $('<span class="small text-muted">').text(cliente.telefono || '')))
        .click(e => {
          e.preventDefault();
          window.seleccionarCliente(cliente);
          $lista.remove();
        }).appendTo($lista);
    });
    $container.append($lista.show());
  }

  mod.cargarSesionProvisional();
  mod.getOrCreateConsumidorFinal().then(cf => {
    if (!$('#cliente_id').val() && cf) window.seleccionarCliente(cf);
  });

  $('#cliente').on('input', function () {
    clearTimeout(mod.timeoutCliente);
    const valor = $(this).val();
    if (valor.length < 2) return;
    mod.timeoutCliente = setTimeout(() => {
      $.ajax({
        url: '/api/clientes/buscar',
        data: { q: valor },
        success: function (clientes) {
          if (clientes.length === 0) { $('#infoCliente').hide(); return; }
          if (clientes.length === 1) window.seleccionarCliente(clientes[0]);
          else mostrarListaClientes(clientes);
        }
      });
    }, 300);
  });

  $('#producto').on('input', function () {
    clearTimeout(mod.timeoutProducto);
    const valor = $(this).val().trim();
    const $res = $('#resultadosProductos');
    if (valor.length < 2) { $res.hide(); return; }

    $res.html('<div class="p-2 text-muted small text-center"><div class="spinner-border spinner-border-sm me-1" role="status"></div> Buscando...</div>').show();

    mod.timeoutProducto = setTimeout(() => {
      $.ajax({
        url: '/api/productos/buscar',
        data: { q: valor },
        success: productos => mostrarListaProductos(productos),
        error: () => {
          $res.html('<div class="p-3 text-danger small text-center"><i class="bi bi-exclamation-triangle"></i> Error en la búsqueda</div>').show();
        }
      });
    }, 300);
  });

  function mostrarListaProductos(productos) {
    const $res = $('#resultadosProductos').empty();
    if (!productos || !productos.length) {
      $res.html('<div class="p-3 text-muted small text-center"><i class="bi bi-search"></i> No se encontraron productos</div>').show();
      return;
    }
    productos.forEach(p => {
      const precio = (Number(p.precio_unidad) || 0).toLocaleString('es-CO');
      $('<a href="#" class="search-item">')
        .append($('<div class="item-info">').append($('<span class="item-name">').text(p.nombre), $('<small class="text-muted">').text(p.codigo || '')), $('<div class="item-price">').text(`$${precio}`))
        .click(e => { e.preventDefault(); agregarProductoALista(p); $res.hide(); })
        .appendTo($res);
    });
    $res.show();
  }

  function agregarProductoALista(p) {
    const precio = Number(p.precio_unidad) || 0;
    const item = { producto_id: p.id, nombre: p.nombre, cantidad: 1, unidad: 'UND', precio_original: precio, precio, descuento_porcentaje: 0 };
    mod.productosFactura.push(item);
    mod.actualizarTablaProductos();
    $('#producto').val('').focus();
  }

  $('#guardarCliente').click(function () {
    const data = {
      nombre: $('#nombreCliente').val().trim(),
      direccion: $('#direccionNuevoCliente').val().trim(),
      telefono: $('#telefonoNuevoCliente').val().trim()
    };
    if (!data.nombre) return Swal.fire('Error', 'El nombre es obligatorio', 'warning');
    const $btn = $(this).prop('disabled', true).text('Guardando...');
    $.ajax({
      url: '/api/clientes',
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify(data),
      success: res => {
        window.seleccionarCliente({ id: res.id, ...data });
        bootstrap.Modal.getInstance(document.getElementById('nuevoClienteModal')).hide();
        $('#formNuevoCliente')[0].reset();
        Swal.fire('Éxito', 'Cliente guardado', 'success');
      },
      error: () => Swal.fire('Error', 'No se pudo guardar el cliente', 'error'),
      complete: () => $btn.prop('disabled', false).html('<i class="bi bi-save me-1"></i> Guardar')
    });
  });

  window.abrirModalDescuento = idx => {
    window._descIdx = idx;
    const it = mod.productosFactura[idx];
    $('#descuentoModalProducto').text(it.nombre);
    $('#descuentoModalPrecioActual').text(it.precio.toLocaleString('es-CO'));
    $('#descuentoPorcentajeManual').val(it.descuento_porcentaje || '');
    $('#nuevoPrecioManual').val(it.precio);
    new bootstrap.Modal(document.getElementById('descuentoModal')).show();
  };

  $(document).on('click', '.btn-descuento-quick', function () { aplicarDescPct($(this).data('pct')); });
  $('#btnAplicarPctManual').click(() => aplicarDescPct($('#descuentoPorcentajeManual').val()));
  $('#btnAplicarPrecioFijo').click(() => {
    const it = mod.productosFactura[window._descIdx];
    it.precio = Number.parseFloat($('#nuevoPrecioManual').val()) || it.precio;
    it.descuento_porcentaje = 0;
    mod.actualizarTablaProductos();
    bootstrap.Modal.getInstance(document.getElementById('descuentoModal')).hide();
  });

  function aplicarDescPct(p) {
    const it = mod.productosFactura[window._descIdx];
    it.descuento_porcentaje = Number.parseFloat(p) || 0;
    mod.actualizarTablaProductos();
    bootstrap.Modal.getInstance(document.getElementById('descuentoModal')).hide();
  }

  $('#quitarDescuentoBtn').click(() => {
    const it = mod.productosFactura[window._descIdx];
    it.precio = it.precio_original;
    it.descuento_porcentaje = 0;
    mod.actualizarTablaProductos();
    bootstrap.Modal.getInstance(document.getElementById('descuentoModal')).hide();
  });

  $('#generarFactura').click(function () {
    const cid = $('#cliente_id').val();
    if (!cid) return Swal.fire('Atención', 'Seleccione un cliente', 'warning');
    if (!mod.productosFactura.length) return Swal.fire('Atención', 'Agregue productos', 'warning');

    Swal.fire({ title: 'Generando factura...', didOpen: () => Swal.showLoading() });
    $.ajax({
      url: '/api/facturas',
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({
        cliente_id: cid,
        total: mod.totalFactura,
        forma_pago: $('#formaPago').val(),
        evento_id: $('#eventoId').val() || null,
        productos: mod.productosFactura.map(p => ({
          producto_id: p.producto_id,
          cantidad: p.cantidad,
          precio: p.precio * (1 - (p.descuento_porcentaje || 0) / 100),
          precio_original: p.precio_original,
          unidad: p.unidad,
          subtotal: mod.subtotalLinea(p),
          descuento_porcentaje: p.descuento_porcentaje || null
        }))
      }),
      success: res => {
        Swal.close();
        const modal = new bootstrap.Modal(document.getElementById('facturaModal'));
        $('#facturaFrame').attr('src', `/api/facturas/${res.id}/imprimir`);
        modal.show();
        mod.limpiarSesionProvisional();
        limpiarTodo();
      },
      error: xhr => Swal.fire('Error', xhr.responseJSON?.error || 'No se pudo generar factura', 'error')
    });
  });

  function limpiarTodo() {
    mod.productosFactura = [];
    mod.totalFactura = 0;
    mod.actualizarTablaProductos();
    $('#infoCliente').hide();
    $('#cliente_id').val('');
    $('#cliente').val('');
    mod.getOrCreateConsumidorFinal().then(cf => cf && window.seleccionarCliente(cf));
  }

  $('#nuevaVenta').click(() => { mod.limpiarSesionProvisional(); limpiarTodo(); });

  // Navigation Steps
  function goToStep(step) {
    if (step < 1 || step > 4) return;

    if (step > mod.currentStep) {
      if (mod.currentStep === 1 && !$('#cliente_id').val()) {
        return Swal.fire('Atención', 'Por favor seleccione un cliente para continuar', 'warning');
      }
      if (mod.currentStep === 2 && mod.productosFactura.length === 0) {
        return Swal.fire('Atención', 'Agregue al menos un producto a la venta', 'warning');
      }
    }

    mod.currentStep = step;

    $('.step-content').removeClass('active');
    $(`#content-step-${mod.currentStep}`).addClass('active');

    updateStepVisuals();

    $('#btnStepBack').css('visibility', mod.currentStep === 1 ? 'hidden' : 'visible');
    
    if (mod.currentStep === 4) {
      $('#btnStepNext').fadeOut();
      actualizarResumenFinal();
    } else {
      $('#btnStepNext').fadeIn();
    }

    $('.flow-card')[0].scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function updateStepVisuals() {
    const icons = { 1: 'person', 2: 'box-seam', 3: 'credit-card', 4: 'file-earmark-text' };
    $('.step-item').each(function() {
      const stepNum = $(this).data('step');
      $(this).removeClass('active completed');
      
      if (stepNum === mod.currentStep) {
        $(this).addClass('active');
        $(this).find('.step-circle').html(`<i class="bi bi-${icons[stepNum]}"></i>`);
      } else if (stepNum < mod.currentStep) {
        $(this).addClass('completed');
        $(this).find('.step-circle').html('<i class="bi bi-check-lg"></i>');
      } else {
        $(this).find('.step-circle').html(`<i class="bi bi-${icons[stepNum]}"></i>`);
      }
    });
  }

  function actualizarResumenFinal() {
    const subtotal = mod.totalFactura;
    const total = subtotal;

    $('#resumenSubtotal').text(`$${subtotal.toLocaleString('es-CO')}`);
    $('#resumenTotal').text(total.toLocaleString('es-CO'));
    const descTotal = mod.productosFactura.reduce((s, p) => s + (p.precio_original * p.cantidad - mod.subtotalLinea(p)), 0);
    $('#resumenDescuento').text(`-$${descTotal.toLocaleString('es-CO')}`);
  }

  $('#btnStepNext').click(() => goToStep(mod.currentStep + 1));
  $('#btnStepBack').click(() => goToStep(mod.currentStep - 1));

  $('input[name="forma_pago_radio"]').change(function() {
    $('#formaPago').val($(this).val());
  });

  $(document).on('click', '.step-item.completed, .step-item.active', function() {
    goToStep($(this).data('step'));
  });

  $(document).on('click', e => { if (!$(e.target).closest('.search-container').length) $('#resultadosProductos').hide(); });
});
