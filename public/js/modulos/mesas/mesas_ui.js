// UI rendering, Search, and Event bindings for Mesas module

window.MesasModule.renderItems = function() {
  const tbody = $('#tbodyItems');
  tbody.empty();
  let totalRestante = 0;
  
  this.items.forEach((it, idx) => {
    const cantidad = Number(it.cantidad || 0);
    const precio = Number((it.precio_unitario != null ? it.precio_unitario : it.precio) || 0);
    const subtotal = this.subtotalConDescuento(cantidad, precio, it.id);
    
    if (!it.pagado) {
      totalRestante += subtotal;
    }

    const descBadge = (this.descuentosPorItem[it.id] != null && this.descuentosPorItem[it.id] > 0)
      ? ' <span class="badge bg-success">-' + this.descuentosPorItem[it.id] + '%</span>' : '';
    const badgePagado = it.pagado ? '<br><span class="badge bg-success mt-1"><i class="bi bi-check2-circle me-1"></i>Pagado</span>' : '';

    const buttonsHtml = it.pagado
      ? `<div class="text-success text-center px-1" title="Este ítem ya está pago"><i class="bi bi-check2-all fs-5"></i></div>`
      : `<div class="btn-group btn-group-sm">
           <button type="button" class="btn btn-outline-secondary btn-menos-item" data-item-id="${it.id}" data-cantidad="${cantidad}"><i class="bi bi-dash"></i></button>
           <button type="button" class="btn btn-outline-secondary btn-mas-item" data-item-id="${it.id}" data-cantidad="${cantidad}"><i class="bi bi-plus"></i></button>
           <button type="button" class="btn btn-outline-danger btn-eliminar-item" data-idx="${idx}" data-item-id="${it.id}"><i class="bi bi-trash"></i></button>
         </div>`;

    const inputHtml = it.pagado
      ? `<div class="text-center text-muted fw-bold d-flex align-items-center justify-content-center" style="height: 31px;">${cantidad}</div>`
      : `<input type="number" class="form-control form-control-sm text-center input-cantidad-item" data-item-id="${it.id}" value="${cantidad}" min="1" style="width: 70px; margin: 0 auto;">`;

    tbody.append(`
      <tr>
        <td class="td-producto align-middle">${(it.producto_nombre || it.nombre || it.producto_id) + descBadge + badgePagado}</td>
        <td class="text-center align-middle">${inputHtml}</td>
        <td class="text-end d-none d-sm-table-cell align-middle">${this.formatear(precio)}</td>
        <td class="text-end td-subtotal align-middle">${it.pagado ? '<span class="text-muted text-decoration-line-through small">' + this.formatear(subtotal) + '</span>' : this.formatear(subtotal)}</td>
        <td class="text-center align-middle">${buttonsHtml}</td>
      </tr>
    `);
  });
  const totalConPropina = totalRestante + this.propinaPedido;
  $('#totalPedido').text(this.formatear(totalConPropina));
  $('#propinaLinea').toggleClass('d-none', this.propinaPedido <= 0);
  $('#propinaMonto').text(this.formatear(this.propinaPedido));
};

window.MesasModule.actualizarUICliente = function() {
  const nombre = this.clienteActual.nombre || 'Consumidor Final';
  $('#labelClienteActual').text('Cliente: ' + nombre);

  let textoBoton = nombre.split(' ')[0];
  if (textoBoton.length > 8) textoBoton = textoBoton.substring(0, 7) + '..';
  $('#btnClienteTexto').text(textoBoton);
};

window.MesasModule.seleccionarProducto = async function(p) {
  await this.runWithOffcanvasHidden(async () => {
    let nota = '';
    const isComida = (p.categoria_nombre || '').trim().toLowerCase() === 'comidas';
    if (isComida) {
      const notaRes = await Swal.fire({
        title: 'Nota para cocina (opcional)',
        input: 'text', inputPlaceholder: 'Ej: sin cebolla, sin queso...', showCancelButton: true,
        didOpen: () => {
          const inp = document.querySelector('.swal2-input');
          if (inp) {
            ['keydown', 'keyup', 'keypress', 'paste', 'copy', 'cut', 'contextmenu'].forEach(evt => {
              inp.addEventListener(evt, e => e.stopPropagation());
            });
          }
        }
      });
      if (!notaRes.isConfirmed) return;
      nota = (notaRes.value || '').trim();
    }
    const unidad = 'UND';
    const precio = Number(p.precio_unidad != null ? p.precio_unitario || p.precio_unidad : (p.precio || 0));
    const body = { producto_id: p.id, cantidad: 1, unidad, precio: Number(precio), nota };
    const resp = await fetch(`/api/mesas/pedidos/${this.pedidoActual.id}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await resp.json();
    if (!resp.ok) return Swal.fire({ icon: 'error', title: data.error || 'Error al agregar' });
    this.currentMesaEstado = 'ocupada';
    await this.cargarPedido(this.pedidoActual.id);
    $('#buscarProductoMesa').val('').focus();
  });
};

// State refresh in live
window.refreshMesas = async function() {
  try {
    const resp = await fetch('/api/mesas/listar');
    const mesas = await resp.json();
    if (!Array.isArray(mesas)) return;
    mesas.forEach(m => {
      const card = document.querySelector(`.mesa-card[data-mesa-id="${m.id}"]`);
      if (!card) return;
      const estadoAnterior = card.dataset.mesaEstado;
      if (estadoAnterior === m.estado) return;

      card.dataset.mesaEstado = m.estado;
      card.classList.remove('libre', 'ocupada', 'reservada');
      card.classList.add(m.estado);

      // Update badge for physical table if it exists
      const physicalBadge = card.querySelector('.mesa-real-objeto-badge');
      if (physicalBadge) {
        if (m.estado === 'ocupada') {
          physicalBadge.className = 'mesa-real-objeto-badge badge bg-danger border border-light animate-pulse';
          physicalBadge.innerHTML = '<i class="bi bi-egg-fried me-1"></i>ACTIVA';
        } else if (m.estado === 'reservada') {
          physicalBadge.className = 'mesa-real-objeto-badge badge bg-warning text-dark border border-light';
          physicalBadge.innerHTML = 'RES';
        } else {
          physicalBadge.className = 'mesa-real-objeto-badge text-white-50 fs-9';
          physicalBadge.innerHTML = 'Libre';
        }
      }

      const pill = card.querySelector('.mesa-estado-pill');
      if (pill) {
        pill.classList.remove('pill-libre', 'pill-ocupada', 'pill-reservada');
        pill.classList.add('pill-' + m.estado);
        const texto = m.estado === 'libre' ? 'Libre' : (m.estado === 'ocupada' ? 'Ocupada' : 'Reservada');
        pill.innerHTML = '<i class="bi bi-circle-fill" style="font-size:.5rem;"></i>' + texto;
      }

      const btnCta = card.querySelector('.btnAbrirPedido');
      if (btnCta) {
        const isVirtual = card.classList.contains('virtual');
        if (m.estado === 'libre') {
          if (isVirtual) {
            btnCta.className = 'btn btn-success btn-cta btnAbrirPedido py-2 rounded-3 fw-bold';
            btnCta.innerHTML = '<i class="bi bi-plus-circle me-1"></i>Abrir pedido';
          } else {
            btnCta.className = 'btn btn-success btn-cta btn-premium-action btnAbrirPedido w-100';
            btnCta.innerHTML = '<i class="bi bi-plus-circle me-1"></i>Abrir comanda';
          }
        } else {
          if (isVirtual) {
            btnCta.className = 'btn btn-warning btn-cta btnAbrirPedido py-2 rounded-3 fw-bold';
            btnCta.innerHTML = '<i class="bi bi-pencil-square me-1"></i>Editar pedido';
          } else {
            btnCta.className = 'btn btn-warning btn-cta btn-premium-action text-dark btnAbrirPedido w-100';
            btnCta.innerHTML = '<i class="bi bi-pencil-square me-1"></i>Gestionar mesa';
          }
        }
      }

      const btnLiberar = card.querySelector('.btnLiberarMesa');
      if (m.estado === 'libre') {
        if (btnLiberar) btnLiberar.remove();
      } else if (!btnLiberar) {
        const btnVer = card.querySelector('.btnVerPedido');
        if (btnVer) {
          const isVirtual = card.classList.contains('virtual');
          const nuevoBtn = document.createElement('button');
          if (isVirtual) {
            nuevoBtn.className = 'btn btn-outline-secondary btn-sec flex-fill btnLiberarMesa rounded-3 py-1_5';
            nuevoBtn.title = 'Liberar mesa';
            nuevoBtn.innerHTML = '<i class="bi bi-unlock me-1"></i>Liberar';
          } else {
            nuevoBtn.className = 'btn btn-outline-danger btn-sec btn-premium-secondary flex-fill btnLiberarMesa';
            nuevoBtn.title = 'Liberar mesa inmediatamente';
            nuevoBtn.innerHTML = '<i class="bi bi-unlock"></i>';
          }
          btnVer.insertAdjacentElement('afterend', nuevoBtn);
        }
      }
    });

    const idsRecibidos = mesas.map(m => m.id);
    document.querySelectorAll('.mesa-card.virtual').forEach(card => {
      const id = parseInt(card.dataset.mesaId);
      const col = card.closest('.col-6, .col-sm-6');
      if (!idsRecibidos.includes(id)) {
        if (col) col.style.display = 'none';
      } else {
        if (col) col.style.display = 'block';
      }
    });
  } catch (_) {}
};

$(function () {
  const mod = window.MesasModule;

  // Set interval to refresh tables
  setInterval(window.refreshMesas, 3000);
  window.refreshMesas();

  // +/- cantidad en items del pedido (mesa)
  $(document).on('click', '.btn-mas-item', async function () {
    const id = $(this).data('item-id');
    const cant = Number($(this).data('cantidad')) + 1;
    try {
      const r = await fetch(`/api/mesas/items/${id}/cantidad`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cantidad: cant }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Error');
      await mod.cargarPedido(mod.pedidoActual.id);
    } catch (e) { Swal.fire({ icon: 'error', title: e.message }); }
  });

  $(document).on('change', '.input-cantidad-item', async function () {
    const id = $(this).data('item-id');
    const cant = parseInt($(this).val(), 10);
    if (isNaN(cant) || cant <= 0) {
      $(this).val(1);
      return;
    }
    try {
      const r = await fetch(`/api/mesas/items/${id}/cantidad`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cantidad: cant }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Error');
      await mod.cargarPedido(mod.pedidoActual.id);
    } catch (e) { Swal.fire({ icon: 'error', title: e.message }); }
  });

  $(document).on('click', '.btn-menos-item', async function () {
    const id = $(this).data('item-id');
    const cant = Number($(this).data('cantidad'));
    if (cant <= 1) return;
    try {
      const r = await fetch(`/api/mesas/items/${id}/cantidad`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cantidad: cant - 1 }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Error');
      await mod.cargarPedido(mod.pedidoActual.id);
    } catch (e) { Swal.fire({ icon: 'error', title: e.message }); }
  });

  $(document).on('click', '.btn-eliminar-item', async function () {
    const idx = $(this).data('idx');
    const itemId = $(this).data('item-id');
    const it = mod.items[idx];
    if (!it) return;
    const ok = await Swal.fire({ title: '¿Eliminar este item?', icon: 'question', showCancelButton: true, confirmButtonText: 'Sí', cancelButtonText: 'Cancelar' });
    if (!ok.isConfirmed) return;
    try {
      const r = await fetch(`/api/mesas/items/${itemId}`, { method: 'DELETE' });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Error'); }
      await mod.cargarPedido(mod.pedidoActual.id);
      Swal.fire({ icon: 'success', title: 'Item eliminado' });
    } catch (e) { Swal.fire({ icon: 'error', title: e.message }); }
  });

  // Evento para botón en el Header del offcanvas
  $('#btnLimpiarPedidoHeader').on('click', async function() {
    if (!mod.pedidoActual) return;
    const result = await Swal.fire({
      title: '¿Vaciar pedido?',
      text: 'Se eliminarán todos los productos de esta mesa. Esta acción no se puede deshacer.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, vaciar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#f1c40f'
    });

    if (result.isConfirmed) {
      try {
        Utils.showLoading('Vaciando pedido...');
        const r = await fetch(`/api/mesas/pedidos/${mod.pedidoActual.id}/limpiar`, { method: 'DELETE' });
        const data = await r.json();
        Utils.hideLoading();

        if (!r.ok) throw new Error(data.error || 'Error al vaciar pedido');

        Swal.fire({ icon: 'success', title: 'Pedido vaciado', timer: 2000 });
        const bsOffcanvas = bootstrap.Offcanvas.getInstance(document.getElementById('canvasPedido'));
        if (bsOffcanvas) bsOffcanvas.hide();
        
        if (typeof refreshMesas === 'function') refreshMesas();
        else window.location.reload();
      } catch (err) {
        Utils.hideLoading();
        Swal.fire({ icon: 'error', title: 'Error', text: err.message });
      }
    }
  });

  // Searching logic for products in tables view
  let to;
  $('#buscarProductoMesa').on('input', function () {
    clearTimeout(to);
    const q = this.value.trim();
    if (q.length < 2) { $('#resultadosProductoMesa').hide().empty(); return; }
    to = setTimeout(async () => {
      const resp = await fetch(`/api/productos/buscar?q=${encodeURIComponent(q)}`);
      const productos = await resp.json();
      const list = $('#resultadosProductoMesa');
      list.empty();
      if (productos.length === 0) {
        list.append('<div class="list-group-item text-muted">No se encontraron productos</div>');
      } else {
        productos.forEach(p => {
          const precio = p.precio_unidad != null ? p.precio_unidad : (p.precio || 0);
          const item = $(`
            <a href="#" class="list-group-item list-group-item-action">
              <div class="d-flex justify-content-between align-items-center">
                <div>
                  <div class="fw-bold text-primary">${p.codigo}</div>
                  <div class="text-dark">${p.nombre}</div>
                </div>
                <div class="text-end">
                    <span class="badge bg-light text-dark border">$${Number(precio).toLocaleString()}</span>
                </div>
              </div>
            </a>`);
          item.on('click', e => {
            e.preventDefault();
            list.hide().empty();
            $('#buscarProductoMesa').val('');
            mod.seleccionarProducto(p);
          });
          list.append(item);
        });
      }
      list.show();
    }, 250);
  });

  // Cerrar listas al hacer click fuera
  $(document).on('click', function (e) {
    if (!$(e.target).closest('#buscarProductoMesa, #resultadosProductoMesa').length) {
      $('#resultadosProductoMesa').hide();
    }
  });

  // Event handlers for favorites
  $(document).on('click', '.producto-fav-card', function () {
    const p = {
      id: $(this).data('id'),
      nombre: $(this).data('nombre'),
      precio_unidad: $(this).data('precio'),
      categoria_nombre: $(this).data('categoria-nombre')
    };
    mod.seleccionarProducto(p);
  });

  $('#filtroCategoriaFav').on('change', function () {
    const catId = $(this).val();
    if (catId === 'todos') {
      $('.producto-fav-card').fadeIn(200);
    } else {
      $('.producto-fav-card').each(function () {
        const itemCatId = $(this).data('categoria');
        if (String(itemCatId) === String(catId)) {
          $(this).fadeIn(200);
        } else {
          $(this).fadeOut(100);
        }
      });
    }
  });
});
