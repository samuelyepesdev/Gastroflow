// Rendering and UI events for Facturas module

$(function () {
  const mod = window.FacturasModule;

  function badgeDescuento(it) {
    if (it.descuento_valor > 0) {
      return `<span class="badge bg-success">-$${Number(it.descuento_valor).toLocaleString('es-CO')}</span>`;
    }
    if (it.descuento_porcentaje > 0) {
      return `<span class="badge bg-success">-${it.descuento_porcentaje}%</span>`;
    }
    return '';
  }

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
        <td>${GF.escapeHtml(it.nombre)} ${badgeDescuento(it)}</td>
        <td class="text-center text-nowrap">
          <button class="btn btn-sm btn-outline-secondary" onclick="cambiarCant(${idx},-1)"><i class="bi bi-dash"></i></button>
          <input type="number" class="form-control form-control-sm text-center d-inline-block mx-1" style="width: 70px;" value="${it.cantidad}" onchange="setCant(${idx}, this.value)" min="1">
          <button class="btn btn-sm btn-outline-secondary" onclick="cambiarCant(${idx},1)"><i class="bi bi-plus"></i></button>
        </td>
        <td>${GF.escapeHtml(it.unidad)}</td>
        <td class="text-end">$${it.precio.toLocaleString('es-CO')}</td>
        <td class="text-end">$${it.subtotal.toLocaleString('es-CO')}</td>
        <td class="text-center">
          <button class="btn btn-sm btn-outline-primary" onclick="abrirModalDescuento(${idx})"><i class="bi bi-percent"></i></button>
          <button class="btn btn-sm btn-outline-danger" onclick="eliminarProducto(${idx})"><i class="bi bi-trash"></i></button>
        </td>
      </tr>`);
    });
    actualizarMobile();
    mod.refrescarBono();
    mod.guardarSesionProvisional();
  };

  function actualizarMobile() {
    let html = '';
    mod.productosFactura.forEach((it, idx) => {
      html += `<div class="producto-mobile-card p-2 mb-2 bg-white border rounded">
        <div class="fw-bold small">${GF.escapeHtml(it.nombre)} ${badgeDescuento(it)}</div>
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
    const item = { producto_id: p.id, nombre: p.nombre, cantidad: 1, unidad: 'UND', precio_original: precio, precio, descuento_porcentaje: 0, descuento_valor: 0 };
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
    $('#descuentoValorManual').val(it.descuento_valor ? MoneyInput.format(String(it.descuento_valor)) : '');
    new bootstrap.Modal(document.getElementById('descuentoModal')).show();
  };

  $(document).on('click', '.btn-descuento-quick', function () { aplicarDescPct($(this).data('pct')); });
  $('#btnAplicarPctManual').click(() => aplicarDescPct($('#descuentoPorcentajeManual').val()));
  $('#btnAplicarDescValor').click(() => {
    const it = mod.productosFactura[window._descIdx];
    const bruto = it.cantidad * it.precio;
    it.descuento_valor = Math.min(Math.max(MoneyInput.parse($('#descuentoValorManual').val()) || 0, 0), bruto);
    it.descuento_porcentaje = 0;
    mod.actualizarTablaProductos();
    bootstrap.Modal.getInstance(document.getElementById('descuentoModal')).hide();
  });

  function aplicarDescPct(p) {
    const it = mod.productosFactura[window._descIdx];
    it.descuento_porcentaje = Number.parseFloat(p) || 0;
    it.descuento_valor = 0;
    mod.actualizarTablaProductos();
    bootstrap.Modal.getInstance(document.getElementById('descuentoModal')).hide();
  }

  $('#quitarDescuentoBtn').click(() => {
    const it = mod.productosFactura[window._descIdx];
    it.precio = it.precio_original;
    it.descuento_porcentaje = 0;
    it.descuento_valor = 0;
    mod.actualizarTablaProductos();
    bootstrap.Modal.getInstance(document.getElementById('descuentoModal')).hide();
  });

  $('#generarFactura').click(function () {
    const cid = $('#cliente_id').val();
    if (!cid) return Swal.fire('Atención', 'Seleccione un cliente', 'warning');
    if (!mod.productosFactura.length) return Swal.fire('Atención', 'Agregue productos', 'warning');

    const pago = datosPago();
    if (pago.error) return Swal.fire('Atención', pago.error, 'warning');
    const fecha = $('#fechaVenta').val() || null;
    const totalVenta = mod.totalFactura;
    const btn = this;
    GF.cargando(btn, true);
    GF.cargandoPantalla('Generando factura...');
    GF.api('/api/facturas', {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: {
        cliente_id: cid,
        total: mod.totalFactura,
        forma_pago: $('#formaPago').val(),
        monto_efectivo: pago.efectivo,
        monto_transferencia: pago.transferencia,
        codigo_bono: mod.bono ? mod.bono.codigo : null,
        evento_id: $('#eventoId').val() || null,
        fecha,
        productos: mod.productosFactura.map(p => {
          const bruto = p.cantidad * p.precio;
          const neto = p.descuento_valor > 0
            ? Math.max(0, bruto - p.descuento_valor)
            : bruto * (1 - (p.descuento_porcentaje || 0) / 100);
          return {
            producto_id: p.producto_id,
            cantidad: p.cantidad,
            precio: p.cantidad > 0 ? neto / p.cantidad : p.precio,
            precio_original: p.precio_original,
            unidad: p.unidad,
            subtotal: mod.subtotalLinea(p),
            descuento_porcentaje: p.descuento_valor > 0 ? null : (p.descuento_porcentaje || null),
            descuento_valor: p.descuento_valor > 0 ? p.descuento_valor : null
          };
        })
      }
    }, 'No se pudo generar factura')
      .then(async res => {
        GF.cerrarCargando();
        const [y, m, d] = (fecha || '').split('-');
        await GF.marca.exito({
          titulo: '¡Venta registrada!',
          detalle: `Factura #${res.numero ?? res.id} · ${GF.dinero(totalVenta)}${fecha ? ` · ${d}/${m}/${y}` : ''}`
        });
        const modal = new bootstrap.Modal(document.getElementById('facturaModal'));
        $('#facturaFrame').attr('src', `/api/facturas/${res.id}/imprimir`);
        modal.show();
        mod.limpiarSesionProvisional();
        limpiarTodo();
      })
      .catch(err => {
        GF.cerrarCargando();
        Swal.fire('Error', err.message || 'No se pudo generar factura', 'error');
      })
      .finally(() => GF.cargando(btn, false));
  });

  function limpiarTodo() {
    mod.productosFactura = [];
    mod.quitarBono();
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
      if (mod.currentStep === 3 && step >= 4) {
        const pago = datosPago();
        if (pago.error) return Swal.fire('Atención', pago.error, 'warning');
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

  // --- Pago mixto (efectivo + transferencia) ---
  const ETIQUETA_PAGO = { efectivo: 'Efectivo', transferencia: 'Transferencia', mixto: 'Mixto' };
  const aCobrar = () => Math.max(0, mod.totalFactura - mod.bonoMonto());
  const esMixto = () => $('#formaPago').val() === 'mixto';
  const montoMixto = id => MoneyInput.parse($(id).val());
  const ponerMonto = (id, n) => $(id).val(n > 0 ? MoneyInput.format(String(Math.round(n))) : '');

  function refrescarMixto() {
    $('#wrapMixto').toggleClass('d-none', !esMixto() || aCobrar() <= 0);
    if (!esMixto() || aCobrar() <= 0) return;
    const falta = aCobrar() - montoMixto('#mixtoEfectivo') - montoMixto('#mixtoTransferencia');
    const ok = Math.abs(falta) < 0.5 && montoMixto('#mixtoEfectivo') > 0 && montoMixto('#mixtoTransferencia') > 0;
    let texto = 'Escribe uno de los dos montos y el otro se completa solo.';
    if (montoMixto('#mixtoEfectivo') || montoMixto('#mixtoTransferencia')) {
      if (ok) texto = 'Cuadra con el total a pagar.';
      else if (falta > 0) texto = `Faltan ${GF.dinero(falta)} para completar el total.`;
      else if (falta < 0) texto = `Se pasa por ${GF.dinero(-falta)} del total.`;
      else texto = 'Ambos montos deben ser mayores a cero.';
    }
    const hayEntrada = montoMixto('#mixtoEfectivo') > 0 || montoMixto('#mixtoTransferencia') > 0;
    $('#mixtoEstado').text(texto).toggleClass('text-success', ok).toggleClass('text-danger', hayEntrada && !ok);
  }

  $('#mixtoEfectivo').on('input', () => {
    ponerMonto('#mixtoTransferencia', Math.max(0, aCobrar() - montoMixto('#mixtoEfectivo')));
    refrescarMixto();
  });
  $('#mixtoTransferencia').on('input', () => {
    ponerMonto('#mixtoEfectivo', Math.max(0, aCobrar() - montoMixto('#mixtoTransferencia')));
    refrescarMixto();
  });

  // El total a pagar cambia con los productos y el bono: lo ya escrito deja de cuadrar, así que se limpia.
  const refrescarBonoOriginal = mod.refrescarBono.bind(mod);
  let ultimoCobrar = null;
  mod.refrescarBono = function () {
    refrescarBonoOriginal();
    if (ultimoCobrar !== null && ultimoCobrar !== aCobrar()) {
      $('#mixtoEfectivo, #mixtoTransferencia').val('');
    }
    ultimoCobrar = aCobrar();
    refrescarMixto();
  };

  /** Lo que se envía del pago, o { error } si el mixto no cuadra. */
  function datosPago() {
    if (!esMixto() || aCobrar() <= 0) return { efectivo: null, transferencia: null };
    const efectivo = montoMixto('#mixtoEfectivo');
    const transferencia = montoMixto('#mixtoTransferencia');
    if (efectivo <= 0 || transferencia <= 0) {
      return { error: 'En un pago mixto indica el monto en efectivo y el de transferencia.' };
    }
    if (Math.abs(efectivo + transferencia - aCobrar()) >= 0.5) {
      return { error: 'Efectivo y transferencia deben sumar exactamente el total a pagar.' };
    }
    return { efectivo, transferencia };
  }

  function actualizarResumenFinal() {
    const subtotal = mod.totalFactura;
    const total = subtotal - mod.bonoMonto();
    const pago = datosPago();
    $('#resumenPago').text(
      aCobrar() <= 0
        ? 'Cubierto con bono'
        : esMixto() && !pago.error
          ? `Mixto · Efectivo ${GF.dinero(pago.efectivo)} + Transf. ${GF.dinero(pago.transferencia)}`
          : ETIQUETA_PAGO[$('#formaPago').val()] || '—'
    );

    $('#resumenSubtotal').text(`$${subtotal.toLocaleString('es-CO')}`);
    $('#resumenTotal').text(total.toLocaleString('es-CO'));
    const descTotal = mod.productosFactura.reduce((s, p) => s + (p.precio_original * p.cantidad - mod.subtotalLinea(p)), 0);
    $('#resumenDescuento').text(`-$${descTotal.toLocaleString('es-CO')}`);
    $('#resumenBonoWrap').toggleClass('d-none', !mod.bono);
    $('#resumenBono').text(`-$${mod.bonoMonto().toLocaleString('es-CO')}`);
  }

  $('#btnStepNext').click(() => goToStep(mod.currentStep + 1));
  $('#btnStepBack').click(() => goToStep(mod.currentStep - 1));

  // --- Bono redimible ---
  function bonoInfo(texto, ok) {
    $('#bonoValidacionInfo').text(texto).toggleClass('text-success', ok === true).toggleClass('text-danger', ok === false);
  }

  async function validarBono() {
    // Puede ser el código corto o la URL que trae el QR (el lector la escribe aquí).
    const entrada = $('#codigoBonoInput').val().trim();
    if (!entrada) return bonoInfo('', null);
    bonoInfo('Consultando...', null);
    try {
      const d = await GF.api(`/api/bonos/validar/${encodeURIComponent(entrada)}`, {}, 'Código de bono inválido');
      // El código canónico lo da el servidor (la entrada pudo ser una URL).
      const codigo = d.codigo;
      $('#codigoBonoInput').val(codigo);
      mod.bono = { codigo, saldo: Number(d.saldo_actual) };
      bonoInfo(`Bono aplicado · saldo disponible: ${GF.dinero(d.saldo_actual)}`, true);
      $('#codigoBonoInput').prop('disabled', true);
      $('#btnValidarBono').addClass('d-none');
      $('#btnQuitarBono').removeClass('d-none');
      mod.refrescarBono();
    } catch (err) {
      bonoInfo(err.message, false);
    }
  }

  $('#btnValidarBono').on('click', validarBono);
  $('#btnQuitarBono').on('click', () => mod.quitarBono());
  $('#codigoBonoInput').on('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); validarBono(); }
  });

  $('input[name="forma_pago_radio"]').change(function() {
    $('#formaPago').val($(this).val());
    refrescarMixto();
  });

  $(document).on('click', '.step-item.completed, .step-item.active', function() {
    goToStep($(this).data('step'));
  });

  $(document).on('click', e => { if (!$(e.target).closest('.search-container').length) $('#resultadosProductos').hide(); });
});
