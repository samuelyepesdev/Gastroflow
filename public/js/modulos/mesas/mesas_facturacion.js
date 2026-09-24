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
      input: 'text',
      inputAttributes: { inputmode: 'decimal', style: 'font-size: 1.25rem; text-align: center;' },
      didOpen: (popup) => {
        const inp = popup.querySelector('input');
        if (inp) MoneyInput.attach(inp);
      },
      inputValidator: (value) => {
        const monto = MoneyInput.parse(value);
        if (!monto || monto < subtotalAPagar) return `El monto recibido debe ser mayor o igual a ${mod.formatear(subtotalAPagar)}`;
      },
      showCancelButton: true,
      confirmButtonText: 'Confirmar Pago <i class="bi bi-check-circle"></i>',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#198754',
      cancelButtonColor: '#6c757d',
      customClass: { popup: 'rounded-4 shadow' }
    });
    return recibido ? MoneyInput.parse(recibido) : null;
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
        montoRecibido = recibido;
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
    mod.abonos = [];
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
    // Los abonos libres (no ligados a productos) ya se cobraron antes: se
    // descuentan de lo que falta por pagar al cerrar la mesa.
    const totalAbonado = (mod.abonos || []).reduce((sum, a) => sum + Number(a.monto || 0), 0);
    totalPedido = Math.max(0, totalPedido - totalAbonado);
    return { totalPedido, checkPendientes };
  }

  // --- Abono libre a la cuenta: pago parcial que NO se liga a ningún
  // producto (ej. "me dieron 15.000 en efectivo, el resto lo pasan por
  // transferencia más tarde"). Se resta del saldo pendiente y, al facturar la
  // mesa completa, FacturarPedidoService lo compone junto con lo ya pagado
  // por ítem para que la factura final quede correctamente 'mixto'.
  async function abonarACuenta() {
    if (!mod.pedidoActual?.id) {
      Swal.fire({ icon: 'error', title: 'No hay pedido activo' });
      return;
    }

    const { totalPedido: saldo } = calcularTotalPendienteDelPedido();
    if (saldo <= 0) {
      Swal.fire({ icon: 'info', title: 'No hay saldo pendiente por abonar' });
      return;
    }

    // El offcanvas de la mesa (canvasPedido) atrapa el foco (focus trap de
    // Bootstrap) y se lo roba de vuelta al input del Swal en cuanto este lo
    // recibe, dejando el campo imposible de escribir. runWithOffcanvasHidden
    // lo oculta mientras el Swal está abierto y lo reabre después (mismo
    // patrón que seleccionarProducto en mesas_ui.js y mover pedido en
    // mesas_acciones.js).
    const { value: formData } = await mod.runWithOffcanvasHidden(() =>
      Swal.fire({
        title: '<h4 class="mb-0 fw-bold text-success"><i class="bi bi-piggy-bank me-2"></i>Abonar a la cuenta</h4>',
        html: `
          <p class="mb-2 fs-6">Saldo pendiente: <strong class="text-primary">${mod.formatear(saldo)}</strong></p>
          <p class="text-muted small mb-3">Registra un pago parcial recibido ahora, sin ligarlo a productos puntuales.</p>
          <input id="abonoMontoInput" type="text" inputmode="decimal" class="swal2-input" placeholder="Monto recibido">
          <select id="abonoFormaPagoInput" class="swal2-select">
            <option value="efectivo">Efectivo</option>
            <option value="transferencia">Transferencia</option>
          </select>
        `,
        focusConfirm: false,
        didOpen: popup => {
          const inp = popup.querySelector('#abonoMontoInput');
          if (inp) MoneyInput.attach(inp);
          evitarPropagacionEnInputSwal();
        },
        showCancelButton: true,
        confirmButtonText: 'Registrar abono',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#198754',
        cancelButtonColor: '#6c757d',
        customClass: { popup: 'rounded-4 shadow' },
        preConfirm: () => {
          const popup = Swal.getPopup();
          const monto = MoneyInput.parse(popup.querySelector('#abonoMontoInput').value);
          const forma_pago = popup.querySelector('#abonoFormaPagoInput').value;
          if (!monto || monto <= 0) {
            Swal.showValidationMessage('Ingrese un monto válido');
            return false;
          }
          if (monto > saldo) {
            Swal.showValidationMessage(`El abono no puede superar el saldo pendiente (${mod.formatear(saldo)})`);
            return false;
          }
          return { monto, forma_pago };
        }
      })
    );

    if (!formData) return;

    try {
      const r = await fetch(`/api/mesas/pedidos/${mod.pedidoActual.id}/abonos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error al registrar el abono');

      await mod.cargarPedido(mod.pedidoActual.id);

      Swal.fire({
        icon: 'success',
        title: 'Abono registrado',
        html: `<p>Saldo pendiente: <strong>${mod.formatear(d.saldo_pendiente)}</strong></p>`,
        confirmButtonColor: '#198754',
        customClass: { popup: 'rounded-4 shadow' }
      });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    }
  }

  function filaAbono(a) {
    return `
      <tr>
        <td class="text-start">${a.forma_pago === 'efectivo' ? 'Efectivo' : 'Transferencia'}</td>
        <td class="text-end">${mod.formatear(a.monto)}</td>
        <td class="text-center">
          <button type="button" class="btn btn-sm btn-outline-danger btn-eliminar-abono" data-id="${a.id}" title="Eliminar abono">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      </tr>`;
  }

  async function eliminarAbono(abonoId) {
    const ok = await Swal.fire({
      title: '¿Eliminar este abono?',
      text: 'El monto vuelve a quedar como saldo pendiente.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc3545'
    });
    if (!ok.isConfirmed) return;

    try {
      const r = await fetch(`/api/mesas/abonos/${abonoId}`, { method: 'DELETE' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo eliminar el abono');
      await mod.cargarPedido(mod.pedidoActual.id);
      Swal.close();
      // eslint-disable-next-line no-use-before-define
      verAbonos();
    } catch (err) {
      Swal.fire({ icon: 'error', title: err.message });
    }
  }

  async function verAbonos() {
    if (!mod.pedidoActual?.id) return;
    try {
      const r = await fetch(`/api/mesas/pedidos/${mod.pedidoActual.id}/abonos`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error al cargar los abonos');

      const filas = (d.abonos || []).map(filaAbono).join('');

      Swal.fire({
        title: '<h5 class="mb-0 fw-bold"><i class="bi bi-piggy-bank me-2"></i>Abonos registrados</h5>',
        html: `
          <div class="table-responsive" style="max-height: 280px;">
            <table class="table table-sm align-middle">
              <thead><tr><th class="text-start">Método</th><th class="text-end">Monto</th><th></th></tr></thead>
              <tbody>${filas || '<tr><td colspan="3" class="text-center text-muted py-3">Sin abonos registrados</td></tr>'}</tbody>
            </table>
          </div>
          <p class="text-end fw-bold mb-0 mt-2">Saldo pendiente: ${mod.formatear(d.saldo_pendiente)}</p>
        `,
        showConfirmButton: true,
        confirmButtonText: 'Cerrar',
        confirmButtonColor: '#6c757d',
        customClass: { popup: 'rounded-4 shadow' },
        didOpen: popup => {
          $(popup)
            .find('.btn-eliminar-abono')
            .on('click', function () {
              eliminarAbono($(this).data('id'));
            });
        }
      });
    } catch (err) {
      Swal.fire({ icon: 'error', title: err.message });
    }
  }

  $('#btnAbonarPedido').on('click', abonarACuenta);
  $('#btnVerAbonos').on('click', verAbonos);

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

  async function mostrarModalPago(totalOriginal, clienteId, keyIdemp) {
    const modal = new bootstrap.Modal(document.getElementById('modalPago'));
    let formaPagoSeleccionada = null;
    let montoRecibido = null;
    // El bono se aplica ANTES de elegir método de pago -- `restante` es lo que
    // de verdad hay que cobrar en efectivo/transferencia después de restarlo.
    // Espejo del cálculo de FacturarPedidoService._calcularTotalesYFormaPago
    // (min(saldo, total) se descuenta primero); el servidor sigue siendo la
    // fuente de verdad, esto es solo para que la pantalla no le pida al
    // cajero cobrar de más cuando ya hay un bono cubriendo parte de la cuenta.
    let restante = totalOriginal;
    let bonoAplicado = null; // { codigo, monto }

    function actualizarSegunRestante() {
      $('#modalTotalPago').text(mod.formatear(restante));
      if (bonoAplicado) {
        $('#modalTotalOriginal').text(mod.formatear(totalOriginal));
        $('#modalBonoAplicado').text('-' + mod.formatear(bonoAplicado.monto));
        $('#modalTotalOriginalWrap').show();
      } else {
        $('#modalTotalOriginalWrap').hide();
      }

      $('.payment-card').removeClass('selected');
      $('#panelEfectivo').hide();
      $('#panelTransferencia').hide();
      $('#montoManual').val('');
      $('#infoCambio').hide();
      // Por si una ejecución previa dejó el botón en "Procesando..." (ver click handler).
      $('#btnConfirmarPago').html('Confirmar Pago <i class="bi bi-check-circle"></i>');
      formaPagoSeleccionada = null;
      montoRecibido = null;

      if (restante <= 0) {
        // El bono cubre todo -- no hay que elegir efectivo/transferencia ni
        // pedirle nada más al cliente.
        $('#wrapMetodosPago').hide();
        $('#avisoCubiertoPorBono').show();
        $('#btnConfirmarPago').prop('disabled', false);
      } else {
        $('#wrapMetodosPago').show();
        $('#avisoCubiertoPorBono').hide();
        $('#btnConfirmarPago').prop('disabled', true);
        generarDenominaciones(restante);
      }
    }

    $('#codigoBonoInput').val('').prop('disabled', false);
    $('#btnValidarBono').prop('disabled', false).show();
    $('#btnQuitarBono').hide();
    $('#bonoValidacionInfo').text('').removeClass('text-success text-danger');
    actualizarSegunRestante();

    async function validarBono() {
      const codigo = $('#codigoBonoInput').val().trim().toUpperCase();
      $('#codigoBonoInput').val(codigo);
      if (!codigo) {
        $('#bonoValidacionInfo').text('').removeClass('text-success text-danger');
        return;
      }
      $('#bonoValidacionInfo').text('Consultando...').removeClass('text-success text-danger');
      try {
        const r = await fetch(`/api/bonos/validar/${encodeURIComponent(codigo)}`);
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Código de bono inválido');

        const montoBono = Math.min(Number(d.saldo_actual), totalOriginal);
        bonoAplicado = { codigo, monto: montoBono };
        restante = Math.round((totalOriginal - montoBono) * 100) / 100;

        $('#bonoValidacionInfo')
          .text(`Bono aplicado · saldo disponible: ${mod.formatear(d.saldo_actual)}`)
          .addClass('text-success').removeClass('text-danger');
        $('#codigoBonoInput').prop('disabled', true);
        $('#btnValidarBono').hide();
        $('#btnQuitarBono').show();

        actualizarSegunRestante();
      } catch (err) {
        $('#bonoValidacionInfo').text(err.message).addClass('text-danger').removeClass('text-success');
      }
    }

    function quitarBono() {
      bonoAplicado = null;
      restante = totalOriginal;
      $('#codigoBonoInput').val('').prop('disabled', false);
      $('#btnValidarBono').show();
      $('#btnQuitarBono').hide();
      $('#bonoValidacionInfo').text('').removeClass('text-success text-danger');
      actualizarSegunRestante();
    }

    $('#btnValidarBono').off('click').on('click', validarBono);
    $('#btnQuitarBono').off('click').on('click', quitarBono);
    $('#codigoBonoInput').off('keypress').on('keypress', function (e) {
      if (e.which === 13) {
        e.preventDefault();
        validarBono();
      }
    });

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
        montoRecibido = restante;
      }
    });

    $('.denominacion-btn').off('click').on('click', function () {
      $('.denominacion-btn').removeClass('selected');
      $(this).addClass('selected');
      montoRecibido = Number.parseFloat($(this).data('valor'));
      $('#montoManual').val(MoneyInput.format(String(montoRecibido)));
      calcularCambio(restante, montoRecibido);
      $('#btnConfirmarPago').prop('disabled', false);
    });

    function usarMontoManual() {
      const valor = MoneyInput.parse($('#montoManual').val());
      if (valor < restante) {
        Swal.fire({ icon: 'warning', title: 'El monto debe ser mayor o igual al total' });
        return;
      }
      montoRecibido = valor;
      $('.denominacion-btn').removeClass('selected');
      calcularCambio(restante, valor);
      $('#btnConfirmarPago').prop('disabled', false);
    }

    $('#montoManual').off('input keypress').on('input', function () {
      const valor = MoneyInput.parse($(this).val());
      if (valor > 0) {
        $('.denominacion-btn').removeClass('selected');
        if (valor >= restante) {
          calcularCambio(restante, valor);
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

    $('#btnConfirmarPago').off('click').on('click', async function () {
      if (restante > 0) {
        if (!formaPagoSeleccionada) {
          Swal.fire({ icon: 'warning', title: 'Seleccione una forma de pago' });
          return;
        }
        if (formaPagoSeleccionada === 'efectivo' && (!montoRecibido || montoRecibido < restante)) {
          Swal.fire({ icon: 'warning', title: 'El monto recibido debe ser mayor o igual al total' });
          return;
        }
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
            // Si el bono cubre todo no se eligió tarjeta de pago -- no importa
            // cuál se mande, el servidor solo cobra por ahí si queda algo
            // pendiente tras el bono (ver _calcularTotalesYFormaPago).
            forma_pago: formaPagoSeleccionada || 'efectivo',
            descuentos: mod.descuentosPorItem,
            propina: mod.propinaPedido,
            efectivo_recibido: formaPagoSeleccionada === 'efectivo' ? montoRecibido : null,
            codigo_bono: bonoAplicado ? bonoAplicado.codigo : null
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
        mod.abonos = [];
        mod.propinaPedido = 0;
        mod.renderItems();

        let html = '<p><strong>Factura #' + (data.numero != null ? data.numero : data.factura_id) + '</strong> generada correctamente.</p>';
        if (bonoAplicado) {
          html += '<p class="text-success small mb-1">Bono ' + bonoAplicado.codigo + ' aplicado: -' + mod.formatear(bonoAplicado.monto) + '</p>';
        }
        if (formaPagoSeleccionada === 'efectivo' && montoRecibido > restante) {
          const cambio = montoRecibido - restante;
          html += '<div class="text-start mt-2"><p><strong>Total cobrado:</strong> ' + mod.formatear(restante) + '</p><p><strong>Recibido:</strong> ' + mod.formatear(montoRecibido) + '</p><p class="text-success fw-bold">Cambio: ' + mod.formatear(cambio) + '</p></div>';
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
