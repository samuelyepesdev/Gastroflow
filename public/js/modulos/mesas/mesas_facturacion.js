// Billing and single payment modals for Mesas module

// No captura nada de $(function(){...}) — vive en el scope más alto posible (S7721).
async function getOrCreateConsumidorFinal() {
  try {
    const r = await fetch('/api/clientes/buscar?q=consumidor%20final');
    const list = await r.json();
    const cf = list.find(c => (c.nombre || '').toLowerCase() === 'consumidor final');
    if (cf) return cf;
  } catch (err) {
    console.warn('No se pudo buscar consumidor final existente:', err);
  }
  try {
    const r = await fetch('/api/clientes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: 'Consumidor final' }) });
    if (r.ok) { const cf = await r.json(); return { id: cf.id, nombre: 'Consumidor final' }; }
  } catch (err) {
    console.warn('No se pudo crear consumidor final:', err);
  }
  return { id: null, nombre: 'Consumidor final' };
}

$(function () {
  const mod = window.MesasModule;

  // Extraída del handler de #btnFacturarPedido: las dos ramas "sin ítems pendientes"
  // (con y sin costo) hacían exactamente esta misma petición, solo cambiaba el texto.
  async function facturarPedidoCompleto(clienteId, keyIdemp, extraMsg) {
    try {
      const reqFactura = await fetch(`/api/mesas/pedidos/${mod.pedidoActual.id}/facturar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': keyIdemp
        },
        body: JSON.stringify({
          cliente_id: clienteId,
          forma_pago: 'efectivo',
          descuentos: mod.descuentosPorItem,
          propina: mod.propinaPedido
        })
      });
      const dataF = await reqFactura.json();
      if (!reqFactura.ok) throw new Error(dataF.error || 'Error al facturar');

      Swal.fire({
        icon: 'success',
        title: 'Listo',
        html: '<p><strong>Factura #' + (dataF.numero != null ? dataF.numero : dataF.factura_id) + '</strong> ' + extraMsg + '.</p>',
        confirmButtonText: 'Cerrar'
      }).then(() => {
        mod.canvas.hide();
        if (typeof refreshMesas === 'function') refreshMesas();
      });
    } catch (error_) {
      Swal.fire({ icon: 'error', title: error_.message });
    }
  }

  // Extraída del didOpen del modal "Facturar por Producto": no captura nada del
  // handler que lo abre, solo depende de `popup` (que SweetAlert ya provee) y de
  // `mod` (nivel de módulo), así que puede vivir en el nivel superior (S7721).
  function configurarTablaFacturarPorProducto(popup) {
    const table = $(popup).find('#tabla-pago-masivo');
    const checkTodos = $(popup).find('#check-todos-items');
    const totalValDisplay = $(popup).find('#total-seleccionado-val');

    const actualizarTotal = () => {
      let total = 0;
      table.find('.item-row').each(function () {
        const row = $(this);
        const isChecked = row.find('.check-item').is(':checked');
        if (isChecked) {
          const itemId = row.data('id');
          const precio = Number(row.data('precio'));
          const cant = Number(row.find('.input-cantidad-item').val()) || 1;
          const sub = mod.subtotalConDescuento(cant, precio, itemId);

          row.find('.item-subtotal-display').text(mod.formatear(sub));
          total += sub;
        } else {
          const orig = row.find('.item-subtotal-display').data('original-subtotal');
          row.find('.item-subtotal-display').text(mod.formatear(orig));
        }
      });
      totalValDisplay.text(mod.formatear(total));
    };

    table.on('change', '.check-item', function (e) {
      e.stopPropagation();
      const row = $(this).closest('tr');
      const isChecked = $(this).is(':checked');

      if (isChecked) {
        row.css('background-color', 'rgba(13, 110, 253, 0.075)');
      } else {
        row.css('background-color', '');
      }

      const allChecked = table.find('.check-item').length === table.find('.check-item:checked').length;
      checkTodos.prop('checked', allChecked);

      actualizarTotal();
    });

    table.on('input change', '.input-cantidad-item', function (e) {
      e.stopPropagation();
      const row = $(this).closest('tr');
      const check = row.find('.check-item');
      const max = Number($(this).attr('max'));
      const val = Number($(this).val()) || 1;

      if (val > max) {
        $(this).val(max);
      }
      if (val < 1) {
        $(this).val(1);
      }

      // Si cambian la cantidad, seleccionamos automáticamente el checkbox
      if (!check.is(':checked')) {
        check.prop('checked', true);
        row.css('background-color', 'rgba(13, 110, 253, 0.075)');
        const allChecked = table.find('.check-item').length === table.find('.check-item:checked').length;
        checkTodos.prop('checked', allChecked);
      }

      actualizarTotal();
    });

    checkTodos.on('change', function () {
      const checked = $(this).is(':checked');
      table.find('.check-item').each(function () {
        $(this).prop('checked', checked).trigger('change');
      });
    });

    table.find('.item-row').on('click', function (e) {
      if ($(e.target).is('input') || $(e.target).closest('input').length > 0) return;
      const chk = $(this).find('.check-item');
      chk.prop('checked', !chk.is(':checked')).trigger('change');
    });
  }

  // Extraída del preConfirm del mismo modal: tampoco captura nada, ya usaba
  // Swal.getPopup() en vez de depender de un closure (S7721).
  //
  // Retorna `false` o un objeto a propósito: es el contrato que exige el
  // preConfirm de SweetAlert2 (false bloquea el cierre del modal). Unificar el
  // tipo de retorno rompería esa validación, así que este aviso de SonarQube
  // (S3800) queda intencionalmente sin "corregir" — igual que los dos
  // inputValidator del archivo, que por la misma razón deben devolver un
  // string de error o undefined.
  function preConfirmFacturarPorProducto() {
    const popup = Swal.getPopup();
    const table = $(popup).find('#tabla-pago-masivo');
    const seleccion = [];
    let sumTotal = 0;

    table.find('.item-row').each(function () {
      const row = $(this);
      const isChecked = row.find('.check-item').is(':checked');
      if (isChecked) {
        const itemId = row.data('id');
        const precio = Number(row.data('precio'));
        const cant = Number(row.find('.input-cantidad-item').val()) || 1;
        const sub = mod.subtotalConDescuento(cant, precio, itemId);

        seleccion.push({ itemId, cantidad: cant });
        sumTotal += sub;
      }
    });

    if (seleccion.length === 0) {
      Swal.showValidationMessage('Debe seleccionar al menos un ítem para pagar');
      return false;
    }
    return { items: seleccion, totalAPagar: sumTotal };
  }

  function construirFilasFacturarPorProducto() {
    let rowsHtml = '';
    let hasPendingItems = false;
    mod.items.forEach(it => {
      if (!it.pagado) {
        hasPendingItems = true;
        const cantidad = Number(it.cantidad || 0);
        const precio = Number((it.precio_unitario != null ? it.precio_unitario : it.precio) || 0);
        const subtotal = mod.subtotalConDescuento(cantidad, precio, it.id);
        const nombre = it.producto_nombre || it.nombre || 'Producto sin nombre';

        rowsHtml += `
          <tr class="item-row" data-id="${it.id}" data-precio="${precio}" style="cursor: pointer; transition: background-color 0.2s;">
            <td style="padding: 10px 8px; width: 35px; min-width: 35px;">
              <input type="checkbox" class="form-check-input check-item" data-id="${it.id}" style="transform: scale(1.1);">
            </td>
            <td style="text-align: left; padding: 10px 8px; min-width: 140px;">
              <div class="fw-bold text-dark text-truncate" style="max-width: 160px;" title="${nombre}">${nombre}</div>
              <small class="text-muted fs-7" style="white-space: nowrap;">${mod.formatear(precio)} c/u</small>
            </td>
            <td class="text-center" style="padding: 10px 8px; width: 85px; min-width: 85px; white-space: nowrap;">
              ${cantidad > 1
                ? `<input type="number" class="form-control form-control-sm input-cantidad-item text-center mx-auto px-1"
                     value="${cantidad}" min="1" max="${cantidad}" style="width: 70px; height: 32px; font-weight: 600;">`
                : `<span class="badge bg-light text-secondary border border-secondary-subtle px-2 py-1" style="font-weight: 500;">1</span>
                   <input type="hidden" class="input-cantidad-item" value="1">`
              }
            </td>
            <td class="text-end fw-bold item-subtotal-display text-success" data-original-subtotal="${subtotal}" style="padding: 10px 8px; min-width: 100px; white-space: nowrap;">
              ${mod.formatear(subtotal)}
            </td>
          </tr>
        `;
      }
    });
    return { rowsHtml, hasPendingItems };
  }

  async function elegirProductosAFacturar() {
    const { rowsHtml, hasPendingItems } = construirFilasFacturarPorProducto();

    if (!hasPendingItems) {
      Swal.fire({ icon: 'warning', title: 'No hay ítems pendientes por pagar' });
      return null;
    }

    const tableHtml = `
      <div class="container-fluid p-0" style="font-family: inherit;">
        <p class="text-muted small mb-3 text-start"><i class="bi bi-info-circle me-1"></i> Seleccione los productos y ajuste la cantidad a facturar de cada uno (puede editar la cantidad directamente):</p>
        <div class="table-responsive rounded border shadow-sm mb-2" style="max-height: 320px;">
          <table class="table table-sm table-hover align-middle mb-0" id="tabla-pago-masivo" style="font-size: 0.9rem;">
             <thead class="table-light sticky-top border-bottom bg-white">
               <tr>
                 <th width="35" style="padding: 10px 8px; min-width: 35px;"><input type="checkbox" id="check-todos-items" class="form-check-input" style="transform: scale(1.1);"></th>
                 <th class="text-start" style="padding: 10px 8px; min-width: 140px; white-space: nowrap;">Producto</th>
                 <th width="85" class="text-center" style="padding: 10px 8px; min-width: 85px; white-space: nowrap;">Cant</th>
                 <th class="text-end" style="padding: 10px 8px; min-width: 100px; white-space: nowrap;">Subtotal</th>
               </tr>
             </thead>
             <tbody class="bg-white">
                ${rowsHtml}
             </tbody>
          </table>
        </div>
        <div class="d-flex justify-content-between align-items-center mt-3 p-3 bg-light rounded border border-primary-subtle shadow-xs">
          <span class="fw-bold text-secondary"><i class="bi bi-calculator-fill me-2 text-primary"></i>Total Seleccionado:</span>
          <span class="fw-bolder text-primary fs-4" id="total-seleccionado-val">$0</span>
        </div>
      </div>
    `;

    const { value: itemsSeleccionados } = await Swal.fire({
      title: '<h4 class="mb-0 fw-bold text-primary d-flex align-items-center"><i class="bi bi-cart-check-fill me-2 fs-3"></i> Facturar por Producto</h4>',
      html: tableHtml,
      width: '620px',
      showCancelButton: true,
      confirmButtonText: 'Siguiente <i class="bi bi-arrow-right-short"></i>',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#0d6efd',
      cancelButtonColor: '#6c757d',
      customClass: {
        popup: 'rounded-4 shadow',
        confirmButton: 'px-4 py-2 fw-semibold',
        cancelButton: 'px-4 py-2 fw-semibold'
      },
      didOpen: configurarTablaFacturarPorProducto,
      preConfirm: preConfirmFacturarPorProducto
    });

    return itemsSeleccionados || null;
  }

  async function elegirFormaPagoPorProducto(subtotalAPagar) {
    const inputPagoOptions = { 'efectivo': 'Efectivo', 'transferencia': 'Transferencia' };
    const { value: formaPago } = await Swal.fire({
      title: '<h4 class="mb-0 fw-bold text-primary"><i class="bi bi-cash-stack me-2"></i> Pagar Ítems Seleccionados</h4>',
      html: `<p class="mb-2 fs-5">Monto Total a Pagar: <strong class="text-success">${mod.formatear(subtotalAPagar)}</strong></p><p class="text-muted small">Seleccione el método de pago para los productos elegidos:</p>`,
      input: 'radio',
      inputOptions: inputPagoOptions,
      inputValidator: (value) => { if (!value) return 'Debe elegir un método'; },
      showCancelButton: true,
      confirmButtonText: 'Siguiente <i class="bi bi-arrow-right-short"></i>',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#0d6efd',
      cancelButtonColor: '#6c757d',
      customClass: { popup: 'rounded-4 shadow' }
    });
    return formaPago;
  }

  async function pedirMontoEfectivoPorProducto(subtotalAPagar) {
    const { value: recibido } = await Swal.fire({
      title: '<h4 class="mb-0 fw-bold text-success"><i class="bi bi-wallet2 me-2"></i> Pago en Efectivo</h4>',
      html: `<p class="mb-1 fs-5">Total a pagar: <strong class="text-success fw-bold">${mod.formatear(subtotalAPagar)}</strong></p><p class="text-muted small">Ingrese el monto recibido:</p>`,
      input: 'number',
      inputAttributes: { min: subtotalAPagar, step: 100, style: 'font-size: 1.25rem; text-align: center;' },
      inputValidator: (value) => {
        if (!value || Number.parseFloat(value) < subtotalAPagar) return `El monto recibido debe ser mayor o igual a ${mod.formatear(subtotalAPagar)}`;
      },
      showCancelButton: true,
      confirmButtonText: 'Confirmar Pago <i class="bi bi-check-circle"></i>',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#198754',
      cancelButtonColor: '#6c757d',
      customClass: { popup: 'rounded-4 shadow' }
    });
    return recibido;
  }

  async function procesarPagoMultiple({ items, formaPago, keyIdemp, montoRecibido, cambioADevolver, subtotalAPagar }) {
    Swal.fire({
      title: 'Procesando pago masivo...',
      html: 'Espere un momento por favor.',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    try {
      const r = await fetch(`/api/mesas/items/pagar-multiples`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': keyIdemp
        },
        body: JSON.stringify({
          forma_pago: formaPago,
          items
        })
      });

      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error al procesar el pago masivo');

      await mod.cargarPedido(mod.pedidoActual.id);

      let htmlMsg = `<i class="bi bi-check-circle-fill text-success fs-1 d-block mb-3"></i> <span>Se procesaron los productos correctamente.</span>`;
      if (formaPago === 'efectivo' && montoRecibido > subtotalAPagar) {
        htmlMsg += `<div class="mt-3 p-2 bg-light border rounded text-center"><strong class="text-success fs-5">Cambio a devolver: ${mod.formatear(cambioADevolver)}</strong></div>`;
      }
      Swal.fire({ icon: 'success', title: 'Pago Exitoso', html: htmlMsg, confirmButtonText: 'Aceptar', confirmButtonColor: '#198754', customClass: { popup: 'rounded-4 shadow' } });
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error en el pago', text: e.message, confirmButtonColor: '#dc3545', customClass: { popup: 'rounded-4 shadow' } });
    }
  }

  // Extraída del click de #btnFacturarPedido (rama "Por Producto"): antes vivía
  // como un callback anónimo anidado dentro de runWithOffcanvasHidden, dentro del
  // handler de clic, dentro del IIFE — 5+ niveles de anidación (S2004). Ahora cada
  // paso del flujo es una función nombrada que resume su propio propósito.
  async function facturarPorProducto(keyIdemp) {
    await mod.runWithOffcanvasHidden(async () => {
      const itemsSeleccionados = await elegirProductosAFacturar();
      if (!itemsSeleccionados) return;

      const subtotalAPagar = itemsSeleccionados.totalAPagar;
      const formaPago = await elegirFormaPagoPorProducto(subtotalAPagar);
      if (!formaPago) return;

      let montoRecibido = 0;
      let cambioADevolver = 0;

      if (formaPago === 'efectivo') {
        const recibido = await pedirMontoEfectivoPorProducto(subtotalAPagar);
        if (!recibido) return;
        montoRecibido = Number.parseFloat(recibido);
        cambioADevolver = montoRecibido - subtotalAPagar;
      }

      await procesarPagoMultiple({
        items: itemsSeleccionados.items,
        formaPago,
        keyIdemp,
        montoRecibido,
        cambioADevolver,
        subtotalAPagar
      });
    });
  }

  // --- Pasos extraídos del handler de #btnFacturarPedido (S3776: bajar su
  // complejidad cognitiva de 26 a algo manejable). Cada uno resume una parte
  // del flujo; el handler queda como una lista corta de pasos secuenciales.

  async function pedidoYaFueFacturadoEnOtroLado() {
    try {
      const checkResp = await fetch(`/api/mesas/pedidos/${mod.pedidoActual.id}`);
      if (!checkResp.ok) return false;
      const checkData = await checkResp.json();
      return checkData.pedido?.estado === 'cerrado' || checkData.pedido?.estado === 'cancelado';
    } catch (error_) {
      console.error('Error al verificar estado del pedido:', error_);
      return false;
    }
  }

  function limpiarMesaFacturadaPorOtroDispositivo() {
    $('.modal').each(function () {
      const modalInstance = bootstrap.Modal.getInstance(this);
      modalInstance?.hide();
    });
    if (typeof Swal !== 'undefined' && typeof Swal.close === 'function') {
      Swal.close();
    }
    mod.canvas?.hide();
    mod.pedidoActual = null;
    mod.items = [];
    mod.propinaPedido = 0;
    mod.renderItems();

    Swal.fire({
      icon: 'info',
      title: 'Mesa Facturada',
      text: 'Esta mesa ya ha sido facturada por otro usuario o dispositivo.',
      confirmButtonText: 'Entendido'
    });
    if (typeof refreshMesas === 'function') refreshMesas();
  }

  function calcularTotalPendienteDelPedido() {
    let totalPedido = 0;
    let checkPendientes = false;
    mod.items.forEach(it => {
      if (!it.pagado) {
        const cantidad = Number(it.cantidad || 0);
        const precio = Number((it.precio_unitario != null ? it.precio_unitario : it.precio) || 0);
        const subtotal = mod.subtotalConDescuento(cantidad, precio, it.id);
        totalPedido += subtotal;
        checkPendientes = true;
      }
    });
    return { totalPedido, checkPendientes };
  }

  async function resolverClienteAFacturar() {
    if (mod.clienteActual.id) return mod.clienteActual.id;
    const clienteDefault = await getOrCreateConsumidorFinal();
    return clienteDefault?.id || null;
  }

  $('#btnFacturarPedido').on('click', async function () {
    try {
      // --- GENERAR LLAVE DE IDEMPOTENCIA ÚNICA PARA ESTE INTENTO ---
      const keyIdemp = 'intent_' + Date.now() + '_' + crypto.randomUUID();

      if (!mod.pedidoActual?.id) {
        Swal.fire({ icon: 'error', title: 'No hay pedido activo' });
        return;
      }

      if (await pedidoYaFueFacturadoEnOtroLado()) {
        limpiarMesaFacturadaPorOtroDispositivo();
        return;
      }

      if (mod.items.length === 0) {
        Swal.fire({ icon: 'warning', title: 'El pedido no tiene items' });
        return;
      }

      const { totalPedido, checkPendientes } = calcularTotalPendienteDelPedido();
      const totalConPropinaFacturar = totalPedido + mod.propinaPedido;

      const clienteIdFacturar = await resolverClienteAFacturar();
      if (!clienteIdFacturar) {
        Swal.fire({ icon: 'error', title: 'No se pudo obtener el cliente predeterminado' });
        return;
      }

      if (totalConPropinaFacturar <= 0) {
        const extraMsg = checkPendientes ? 'generada (sin costo)' : 'generada correctamente';
        await facturarPedidoCompleto(clienteIdFacturar, keyIdemp, extraMsg);
        return;
      }

      if (!checkPendientes) {
        await mostrarModalPago(totalConPropinaFacturar, clienteIdFacturar, keyIdemp);
        return;
      }

      const result = await Swal.fire({
        title: 'Opciones de Facturación',
        text: '¿Cómo desea facturar?',
        showDenyButton: true,
        showCancelButton: true,
        confirmButtonText: 'Mesa Completa',
        denyButtonText: 'Por Producto',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#198754',
        denyButtonColor: '#0d6efd'
      });

      if (result.isConfirmed) {
        await mostrarModalPago(totalConPropinaFacturar, clienteIdFacturar, keyIdemp);
      } else if (result.isDenied) {
        await facturarPorProducto(keyIdemp);
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: err.message });
    }
  });

  async function mostrarModalPago(total, clienteId, keyIdemp) {
    const modal = new bootstrap.Modal(document.getElementById('modalPago'));
    let formaPagoSeleccionada = null;
    let montoRecibido = null;

    $('#modalTotalPago').text(mod.formatear(total));
    generarDenominaciones(total);

    $('.payment-card').removeClass('selected');
    $('#panelEfectivo').hide();
    $('#panelTransferencia').hide();
    $('#btnConfirmarPago').prop('disabled', true);
    $('#montoManual').val('');
    $('#infoCambio').hide();

    $('.payment-card').off('click').on('click', function () {
      $('.payment-card').removeClass('selected');
      $(this).addClass('selected');
      formaPagoSeleccionada = $(this).data('payment-type');

      if (formaPagoSeleccionada === 'efectivo') {
        $('#panelEfectivo').slideDown();
        $('#panelTransferencia').slideUp();
        $('#btnConfirmarPago').prop('disabled', true);
      } else {
        $('#panelTransferencia').slideDown();
        $('#panelEfectivo').slideUp();
        $('#btnConfirmarPago').prop('disabled', false);
        montoRecibido = total;
      }
    });

    $('.denominacion-btn').off('click').on('click', function () {
      $('.denominacion-btn').removeClass('selected');
      $(this).addClass('selected');
      montoRecibido = Number.parseFloat($(this).data('valor'));
      $('#montoManual').val(montoRecibido);
      calcularCambio(total, montoRecibido);
      $('#btnConfirmarPago').prop('disabled', false);
    });

    function usarMontoManual() {
      const valor = Number.parseFloat($('#montoManual').val()) || 0;
      if (valor < total) {
        Swal.fire({ icon: 'warning', title: 'El monto debe ser mayor o igual al total' });
        return;
      }
      montoRecibido = valor;
      $('.denominacion-btn').removeClass('selected');
      calcularCambio(total, valor);
      $('#btnConfirmarPago').prop('disabled', false);
    }

    $('#montoManual').off('input keypress').on('input', function () {
      const valor = Number.parseFloat($(this).val()) || 0;
      if (valor > 0) {
        $('.denominacion-btn').removeClass('selected');
        if (valor >= total) {
          calcularCambio(total, valor);
          montoRecibido = valor;
          $('#btnConfirmarPago').prop('disabled', false);
        } else {
          $('#infoCambio').hide();
          $('#btnConfirmarPago').prop('disabled', true);
        }
      } else {
        $('#infoCambio').hide();
        $('#btnConfirmarPago').prop('disabled', true);
      }
    }).on('keypress', function (e) {
      if (e.which === 13) {
        e.preventDefault();
        usarMontoManual();
      }
    });

    $('#btnUsarMontoManual').off('click').on('click', usarMontoManual);

    // Restablecer el botón de pago por si quedó deshabilitado en ejecuciones previas
    $('#btnConfirmarPago').prop('disabled', true).html('Confirmar Pago <i class="bi bi-check-circle"></i>');

    $('#btnConfirmarPago').off('click').on('click', async function () {
      if (!formaPagoSeleccionada) {
        Swal.fire({ icon: 'warning', title: 'Seleccione una forma de pago' });
        return;
      }
      if (formaPagoSeleccionada === 'efectivo' && (!montoRecibido || montoRecibido < total)) {
        Swal.fire({ icon: 'warning', title: 'El monto recibido debe ser mayor o igual al total' });
        return;
      }

      // --- PREVENCIÓN DE DOBLE CLIC FÍSICO ---
      const $btn = $(this);
      $btn.prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-1"></span>Procesando...');

      modal.hide();

      Swal.fire({
        title: 'Generando factura...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      });

      try {
        const resp = await fetch(`/api/mesas/pedidos/${mod.pedidoActual.id}/facturar`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': keyIdemp
          },
          body: JSON.stringify({
            cliente_id: clienteId,
            forma_pago: formaPagoSeleccionada,
            descuentos: mod.descuentosPorItem,
            propina: mod.propinaPedido
          })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Error al facturar');

        Swal.close();
        const modalPago = bootstrap.Modal.getInstance(document.getElementById('modalPago'));
        modalPago?.hide();
        mod.canvas.hide();

        const facturaCanvasEl = document.getElementById('canvasFactura');
        if (facturaCanvasEl?.classList.contains('show')) {
          const facturaCanvas = bootstrap.Offcanvas.getInstance(facturaCanvasEl);
          facturaCanvas?.hide();
        }

        mod.pedidoActual = null;
        mod.items = [];
        mod.propinaPedido = 0;
        mod.renderItems();

        let html = '<p><strong>Factura #' + (data.numero != null ? data.numero : data.factura_id) + '</strong> generada correctamente.</p>';
        if (formaPagoSeleccionada === 'efectivo' && montoRecibido > total) {
          const cambio = montoRecibido - total;
          html += '<div class="text-start mt-2"><p><strong>Total:</strong> ' + mod.formatear(total) + '</p><p><strong>Recibido:</strong> ' + mod.formatear(montoRecibido) + '</p><p class="text-success fw-bold">Cambio: ' + mod.formatear(cambio) + '</p></div>';
        }
        Swal.fire({
          icon: 'success',
          title: 'Listo',
          html: html,
          confirmButtonText: 'Cerrar'
        });
      } catch (err) {
        Swal.fire({ icon: 'error', title: err.message });
      }
    });

    modal.show();
  }

  function generarDenominaciones(total) {
    const denominaciones = [10000, 20000, 50000, 100000, 200000, 500000];
    const container = $('#denominacionesContainer');
    container.empty();

    const disponibles = denominaciones.filter(d => d >= total);
    if (disponibles.length === 0) {
      container.html(`
        <div class="col-12">
          <button class="btn denominacion-btn w-100" data-valor="${denominaciones.at(-1)}">
            $${denominaciones.at(-1).toLocaleString('es-CO')}
          </button>
        </div>
      `);
    } else {
      disponibles.forEach(denom => {
        container.append(`
          <div class="col-6 col-md-4">
            <button class="btn denominacion-btn w-100" data-valor="${denom}">
              $${denom.toLocaleString('es-CO')}
            </button>
          </div>
        `);
      });
    }
  }

  function calcularCambio(total, recibido) {
    if (recibido < total) {
      $('#infoCambio').hide();
      return;
    }
    const cambio = recibido - total;
    $('#montoCambio').text(mod.formatear(cambio));
    $('#montoRecibido').text(mod.formatear(recibido));
    $('#infoCambio').slideDown();
  }
});
