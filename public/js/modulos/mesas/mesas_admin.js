// Table administration and grid events for Mesas module

$(function () {
  const mod = window.MesasModule;

  // Clicks en tarjetas de mesa o representación física de la mesa
  $('.grid-mesas').on('click', '.btnAbrirPedido, .mesa-real-layout-wrapper', function (e) {
    if ($(e.target).closest('.btn-sec').length) return;
    const card = $(this).closest('.card');
    const mesaId = card.data('mesa-id');
    const titulo = card.data('mesa-titulo') || card.find('.text-primary').text().trim() || `Mesa ${card.find('.mesa-real-objeto-num').text().replace('Mesa', '').trim()}`;
    mod.currentMesaEstado = card.data('mesa-estado') || 'libre';
    mod.abrirPedido(mesaId, titulo);
  });

  $('.grid-mesas').on('click', '.btnVerPedido', function () {
    const card = $(this).closest('.card');
    const mesaId = card.data('mesa-id');
    const titulo = card.data('mesa-titulo') || card.find('.text-primary').text().trim();
    mod.currentMesaEstado = card.data('mesa-estado') || 'libre';
    mod.abrirPedido(mesaId, titulo);
  });

  // Liberar mesa desde tarjeta
  $('.grid-mesas').on('click', '.btnLiberarMesa', async function () {
    const card = $(this).closest('.card');
    const mesaId = card.data('mesa-id');
    const mesaNum = card.data('mesa-titulo') || card.find('.text-primary').text().trim();
    mod.liberarMesa(mesaId, mesaNum);
  });

  // Liberar desde header del offcanvas
  $('#btnLiberarMesaHeader').on('click', async function () {
    if (!mod.pedidoActual) return;
    mod.liberarMesa(mod.pedidoActual.mesa_id, $('#pedidoMesa').text());
  });

  // Editar mesa
  $('.grid-mesas').on('click', '.btnEditarMesa', async function () {
    const card = $(this).closest('.card');
    const mesaId = card.data('mesa-id');
    const numeroActual = $(this).data('mesa-numero');
    const descActual = $(this).data('mesa-descripcion') || '';
    const { value: form } = await Swal.fire({
      title: 'Editar mesa',
      html: `
        <div class="text-start">
          <label class="form-label small">Número</label>
          <input id="editMesaNumero" class="form-control mb-2" value="${(numeroActual || '').toString().replace(/"/g, '&quot;')}" />
          <label class="form-label small">Descripción</label>
          <input id="editMesaDesc" class="form-control" value="${(descActual || '').toString().replace(/"/g, '&quot;')}" />
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      preConfirm: () => {
        const num = (document.getElementById('editMesaNumero').value || '').trim();
        const desc = (document.getElementById('editMesaDesc').value || '').trim();
        if (!num) { Swal.showValidationMessage('El número es obligatorio'); return false; }
        if (!desc) { Swal.showValidationMessage('La descripción es obligatoria'); return false; }
        return { numero: num, descripcion: desc };
      }
    });
    if (!form) return;
    try {
      const r = await fetch(`/api/mesas/${mesaId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Error al actualizar');
      Swal.fire({ icon: 'success', title: 'Mesa actualizada' }).then(() => {
        if (typeof refreshMesas === 'function') refreshMesas();
        else location.reload();
      });
    } catch (err) {
      Swal.fire({ icon: 'error', title: err.message });
    }
  });

  // Eliminar mesa
  $('.grid-mesas').on('click', '.btnEliminarMesa', async function () {
    const card = $(this).closest('.card');
    const mesaId = card.data('mesa-id');
    const mesaNum = card.find('.text-primary').text().trim();

    const result = await Swal.fire({
      title: '¿Confirmar eliminación?',
      text: `Se eliminará la Mesa ${mesaNum} permanentemente. Esta acción no se puede deshacer.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar mesa',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6'
    });

    if (!result.isConfirmed) return;

    try {
      Swal.fire({ title: 'Eliminando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      const r = await fetch(`/api/mesas/${mesaId}`, { method: 'DELETE' });
      const data = await r.json();

      if (!r.ok) throw new Error(data.error || 'No se pudo eliminar la mesa');

      Swal.fire({ icon: 'success', title: 'Mesa eliminada', text: 'La mesa ha sido borrada del sistema.', timer: 2000 }).then(() => {
        if (typeof refreshMesas === 'function') refreshMesas();
        else location.reload();
      });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    }
  });

  // Crear nueva mesa
  $('#btnNuevaMesa').on('click', async function () {
    const { value: numero } = await Swal.fire({ title: 'Número de mesa', input: 'text', showCancelButton: true, inputValidator: v => !v?.trim() ? 'El número es obligatorio' : null });
    if (!numero) return;
    const { value: descripcion } = await Swal.fire({ title: 'Descripción (ubicación o nombre)', input: 'text', showCancelButton: true, inputValidator: v => !v?.trim() ? 'La descripción es obligatoria (ej: Terraza, Interior)' : null });
    if (!descripcion) return;
    const resp = await fetch('/api/mesas/crear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ numero, descripcion: descripcion.trim() }) });
    if (!resp.ok) { const err = await resp.json(); return Swal.fire({ icon: 'error', title: err.error || 'Error' }); }
    Swal.fire({ icon: 'success', title: 'Mesa creada' }).then(() => {
      if (typeof refreshMesas === 'function') refreshMesas();
      else location.reload();
    });
  });
});
