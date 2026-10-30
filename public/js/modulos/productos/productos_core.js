// Core state, Class, and Methods for Products module

// Extraída de handleSubmit: reducía la anidación de bloques a 5 niveles
// (try > if isEdit > try > if checkboxes) para una sub-tarea opcional que
// falla en silencio a propósito (planes sin costeo no tienen este endpoint).
async function guardarParametrosCosteo(id) {
  try {
    const checkboxes = document.querySelectorAll('#productoParametrosCheckboxes .producto-parametro-cb:checked');
    if (checkboxes.length === 0 && !document.getElementById('productoParametrosCheckboxes')) return;

    const parametroIds = Array.from(checkboxes).map(cb => Number.parseInt(cb.value, 10));
    await GF.api.put('/costeo/api/productos/' + id + '/parametros', { parametro_ids: parametroIds }, 'Error al guardar parámetros de costeo');
  } catch (costeoErr) {
    if (costeoErr.status === 403) return; // plan sin costeo: se ignora
    console.warn('No se pudieron guardar parámetros de costeo (posiblemente por restricciones de plan):', costeoErr);
  }
}

// Extraída de handleEdit (S3776): también reduce su anidación real
// (try > if paramContainer > try > if status403).
async function cargarParametrosCosteoParaEdicion(id, paramContainer) {
  try {
    // 403 = el plan no incluye costeo: se oculta la sección. Otro error: listas vacías.
    const leer = url => GF.api(url).catch(e => (e.status === 403 ? 'sin-permiso' : []));
    const [allParams, productParams] = await Promise.all([
      leer('/costeo/api/parametros'),
      leer('/costeo/api/productos/' + id + '/parametros')
    ]);

    if (allParams === 'sin-permiso' || productParams === 'sin-permiso') {
      paramContainer.classList.add('d-none');
      return;
    }

    if (!allParams || allParams.length === 0) {
      paramContainer.classList.add('d-none');
      return;
    }

    paramContainer.classList.remove('d-none');
    const assignedIds = new Set((productParams || []).map(p => p.id));
    const div = document.getElementById('productoParametrosCheckboxes');
    div.innerHTML = '';
    allParams.forEach(p => {
      const label = document.createElement('label');
      label.className = 'd-block me-3';
      label.innerHTML = `<input type="checkbox" class="form-check-input me-2 producto-parametro-cb" value="${p.id}" ${assignedIds.has(p.id) ? 'checked' : ''}> ${GF.escapeHtml(p.name)}`;
      div.appendChild(label);
    });
  } catch (e) {
    console.log('Modulo de costeo no disponible o error de red:', e);
    paramContainer.classList.add('d-none');
  }
}

class ProductManager {
  formManager = null;
  tableManager = null;
  searchManager = null;
  _costeoProductoId = null;
  _costeoData = null;
  _modificadoresProductoId = null;

  constructor() {
    this.init();
  }

  async toggleFavorite(id, nuevoEstado, btn) {
    try {
      await GF.api.patch(`/api/productos/${id}/favorito`, { es_favorito: nuevoEstado }, 'Error al actualizar favorito');

      btn.data('favorito', nuevoEstado);
      btn.attr('title', nuevoEstado ? 'Quitar de favoritos' : 'Agregar a favoritos');
      const icon = btn.find('i');
      if (nuevoEstado) {
        icon.removeClass('bi-star text-muted').addClass('bi-star-fill text-warning');
      } else {
        icon.removeClass('bi-star-fill text-warning').addClass('bi-star text-muted');
      }
    } catch (error) {
      GF.error(error.message);
    }
  }

  async toggleDisponible(id, nuevoEstado, input) {
    try {
      await GF.api.patch(`/api/productos/${id}/disponible`, { disponible: nuevoEstado }, 'Error al actualizar la disponibilidad');
      const fila = input.closest('tr');
      fila.toggleClass('producto-inactivo', !nuevoEstado);
      fila.find('.badge-no-disponible').prop('hidden', nuevoEstado);
      GF.toast(nuevoEstado ? 'Producto activado: ya se puede vender' : 'Producto desactivado: no saldrá en carta, POS ni mesas');
    } catch (error) {
      input.prop('checked', !nuevoEstado);
      GF.error(error.message);
    }
  }

  async togglePideNota(id, nuevoEstado, btn) {
    try {
      await GF.api.patch(`/api/productos/${id}/pide-nota`, { pide_nota: nuevoEstado }, 'Error al actualizar la preferencia de nota');

      btn.data('pidenota', nuevoEstado ? 1 : 0);
      btn.toggleClass('active', !!nuevoEstado);
      btn.attr('title', nuevoEstado
        ? 'Pide nota para cocina al ordenarlo (clic para desactivar)'
        : 'Activar: pedir nota para cocina al ordenar este producto');
      const icon = btn.find('i');
      if (nuevoEstado) {
        icon.removeClass('bi-chat-left-text').addClass('bi-chat-left-text-fill');
      } else {
        icon.removeClass('bi-chat-left-text-fill').addClass('bi-chat-left-text');
      }
    } catch (error) {
      GF.error(error.message);
    }
  }

  async showCosteoModal(productoId) {
    const modalEl = document.getElementById('costeoProductoModal');
    const loadingEl = document.getElementById('costeoLoading');
    const contentEl = document.getElementById('costeoContent');
    const errorEl = document.getElementById('costeoError');
    const footerEl = document.getElementById('costeoFooter');
    if (!modalEl || !loadingEl || !contentEl) return;

    loadingEl.classList.remove('d-none');
    contentEl.classList.add('d-none');
    errorEl.classList.add('d-none');
    footerEl.classList.add('d-none');
    errorEl.textContent = '';
    this._costeoProductoId = productoId;
    this._costeoData = null;

    const modal = new bootstrap.Modal(modalEl);
    modal.show();

    try {
      const data = await GF.api(`/costeo/api/costeo/producto/${productoId}`);
      this._costeoData = data;
      const fmt = n => (n == null || Number.isNaN(n) ? '-' : GF.dinero(n, 2));
      document.getElementById('costeoDirecto').textContent = fmt(data.costo_materia_prima_porcion ?? data.costo_directo_porcion);
      const mermaPctEl = document.getElementById('costeoMermaPct');
      if (mermaPctEl) mermaPctEl.textContent = data.merma_pct != null ? data.merma_pct : '0';
      document.getElementById('costeoIndirecto').textContent = fmt(data.merma_monto ?? data.costo_indirecto);
      document.getElementById('costeoTotal').textContent = fmt(data.costo_total_porcion);
      document.getElementById('costeoPrecioSug').textContent = fmt(data.precio_sugerido);
      document.getElementById('costeoPrecioActual').textContent = fmt(data.precio_venta_actual);
      document.getElementById('costeoMargen').textContent = data.margen_actual_pct != null ? data.margen_actual_pct + '%' : '-';
      loadingEl.classList.add('d-none');
      contentEl.classList.remove('d-none');
      footerEl.classList.remove('d-none');
    } catch (err) {
      loadingEl.classList.add('d-none');
      errorEl.textContent = err.message || 'No se pudo cargar el costeo.';
      errorEl.classList.remove('d-none');
      footerEl.classList.remove('d-none');
    }
  }

  async showModificadoresModal(productoId) {
    const modalEl = document.getElementById('productoModificadoresModal');
    const loadingEl = document.getElementById('productoModificadoresLoading');
    const contentEl = document.getElementById('productoModificadoresContent');
    const errorEl = document.getElementById('productoModificadoresError');
    const listaEl = document.getElementById('productoModificadoresLista');
    const vacioEl = document.getElementById('productoModificadoresVacio');
    if (!modalEl || !loadingEl || !contentEl) return;

    loadingEl.classList.remove('d-none');
    contentEl.classList.add('d-none');
    errorEl.classList.add('d-none');
    errorEl.textContent = '';
    this._modificadoresProductoId = productoId;

    const modal = new bootstrap.Modal(modalEl);
    modal.show();

    try {
      const [grupos, asignados] = await Promise.all([
        GF.api('/modificadores/api/grupos'),
        GF.api(`/modificadores/api/productos/${productoId}/grupos`)
      ]);
      const asignadosSet = new Set(asignados || []);

      listaEl.innerHTML = '';
      if (!grupos || grupos.length === 0) {
        vacioEl.classList.remove('d-none');
      } else {
        vacioEl.classList.add('d-none');
        grupos.forEach(g => {
          const label = document.createElement('label');
          label.className = 'list-group-item d-flex align-items-start gap-2';
          label.innerHTML = `
            <input class="form-check-input mt-1 producto-grupo-modificador-cb" type="checkbox" value="${g.id}" ${asignadosSet.has(g.id) ? 'checked' : ''}>
            <span>
              <strong>${GF.escapeHtml(g.nombre)}</strong>
              <span class="badge bg-light text-dark ms-1">${g.tipo_seleccion === 'multiple' ? 'Elige varias' : 'Elige 1'}</span>
              ${g.obligatorio ? '<span class="badge bg-warning text-dark ms-1">Obligatorio</span>' : ''}
              <br><small class="text-muted">${GF.escapeHtml((g.opciones || []).map(o => o.nombre).join(', ') || 'Sin opciones')}</small>
            </span>`;
          listaEl.appendChild(label);
        });
      }
      loadingEl.classList.add('d-none');
      contentEl.classList.remove('d-none');
    } catch (err) {
      loadingEl.classList.add('d-none');
      errorEl.textContent = err.message || 'No se pudieron cargar los grupos de modificadores.';
      errorEl.classList.remove('d-none');
    }
  }

  async guardarModificadoresProducto() {
    const productoId = this._modificadoresProductoId;
    if (!productoId) return;
    const grupoIds = Array.from(document.querySelectorAll('.producto-grupo-modificador-cb:checked')).map(cb => Number.parseInt(cb.value, 10));
    try {
      await GF.api.put(`/modificadores/api/productos/${productoId}/grupos`, { grupo_ids: grupoIds }, 'No se pudo guardar la asignación');
      GF.cerrarModal('productoModificadoresModal');
      GF.toast('Modificadores actualizados', 'success');
    } catch (error) {
      GF.toast(error.message || 'Error al guardar modificadores', 'error');
    }
  }

  async aplicarPrecioSugerido() {
    const id = this._costeoProductoId;
    const data = this._costeoData;
    if (!id || data?.precio_sugerido == null) return;
    try {
      await GF.api.put(`/api/productos/${id}/precio`, { precio_unidad: data.precio_sugerido });
      bootstrap.Modal.getInstance(document.getElementById('costeoProductoModal'))?.hide();
      location.reload();
    } catch (error) {
      GF.error(error.message || 'Error al actualizar precio');
    }
  }

  async handleSubmit(data, isEdit, id) {
    const productData = {
      codigo: data.codigo || document.getElementById('codigo').value,
      nombre: data.nombre || document.getElementById('nombre').value,
      categoria_id: data.categoriaId || document.getElementById('categoriaId').value,
      precio_unidad: MoneyInput.parse(data.precioUnidad || document.getElementById('precioUnidad').value),
      descripcion: document.getElementById('descripcion') ? document.getElementById('descripcion').value : '',
      imagen_url: document.getElementById('imagenUrl')?.value || null,
      tributo: document.getElementById('tributo')?.value || null
    };

    try {
      if (isEdit) {
        await GF.api.put(`/api/productos/${id}`, productData);
        await guardarParametrosCosteo(id);
        GF.toast('Producto actualizado correctamente', 'success');
      } else {
        await GF.api.post('/api/productos', productData);
        GF.toast('Producto creado correctamente', 'success');
      }

      this.formManager.hide();

      setTimeout(() => {
        location.reload();
      }, 1000);
    } catch (error) {
      console.error('Error saving product:', error);
      const errorMessage = error.message || 'Hubo un problema al guardar el producto. Por favor, intente de nuevo.';
      if (error.message?.includes('fetch')) {
        GF.toast('Error de conexión: No se pudo comunicar con el servidor.', 'error');
      } else {
        GF.toast(errorMessage, 'error');
      }
    }
  }

  async handleEdit(id) {
    try {
      const producto = await GF.api.get(`/api/productos/${id}`);
      document.getElementById('productoId').value = producto.id;
      document.getElementById('codigo').value = producto.codigo;
      document.getElementById('nombre').value = producto.nombre;
      document.getElementById('categoriaId').value = producto.categoria_id || '';
      // producto.precio_unidad viene del backend como el DECIMAL crudo de MySQL
      // (ej. "14000.00" con el .00 de centavos que acá nunca se usan) -- pasarlo
      // directo a MoneyInput.format() sin convertirlo a Number primero hace que
      // digitsOnly() se trague el ".00" como 2 dígitos más, multiplicando por
      // 100 cada vez que se abre y se guarda sin querer.
      document.getElementById('precioUnidad').value = MoneyInput.format(
        String(Math.round(Number(producto.precio_unidad) || 0))
      );
      if (document.getElementById('tributo')) {
        document.getElementById('tributo').value = producto.tributo || '';
      }
      if (document.getElementById('descripcion')) {
        document.getElementById('descripcion').value = producto.descripcion || '';
      }
      
      const imgUrl = producto.imagen_url || '';
      const imgUrlEl = document.getElementById('imagenUrl');
      const previewContainer = document.getElementById('imagenPreviewContainer');
      const previewImg = document.getElementById('imagenPreview');
      const imgFileEl = document.getElementById('imagenFile');

      if (imgUrlEl) imgUrlEl.value = imgUrl;
      if (imgFileEl) imgFileEl.value = '';

      if (imgUrl && previewContainer && previewImg) {
        previewImg.src = imgUrl;
        previewContainer.classList.remove('d-none');
      } else if (previewContainer) {
        previewContainer.classList.add('d-none');
      }

      const paramContainer = document.getElementById('productoParametrosContainer');
      if (paramContainer) {
        await cargarParametrosCosteoParaEdicion(id, paramContainer);
      }
    } catch (error) {
      console.error('Error al cargar el producto:', error);
      GF.error('Error al cargar el producto');
    }
  }

  editProduct(id) {
    this.formManager.showEdit(id);
  }

  async deleteProduct(id) {
    const result = await Swal.fire({
      title: '¿Eliminar producto?',
      text: 'Esta acción no se puede deshacer.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc3545',
      cancelButtonColor: '#5b6b7e',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });
    if (!result.isConfirmed) return;

    try {
      await GF.api.delete(`/api/productos/${id}`);
      await Swal.fire({ icon: 'success', title: 'Producto eliminado', timer: 1500, showConfirmButton: false });
      location.reload();
    } catch (error) {
      Swal.fire({ icon: 'error', title: error.message || 'Error al eliminar' });
    }
  }

  applyFilters() {
    if (!this.tableManager) return;

    const searchTerm = (document.getElementById('buscarProducto')?.value || '').toLowerCase();
    const activeBtn = document.querySelector('.category-filter-btn.active');
    const categoriaId = activeBtn ? (activeBtn.dataset.categoriaId || '') : '';

    let visibleCount = 0;
    let totalCount = 0;

    this.tableManager.filterRows((row) => {
      totalCount++;
      let visible = true;

      if (categoriaId) {
        const rowCategoriaId = row.dataset.categoriaId || '';
        if (rowCategoriaId !== categoriaId) {
          visible = false;
        }
      }

      if (visible && searchTerm) {
        const codigo = row.cells[0]?.textContent.toLowerCase() || '';
        const nombre = row.cells[1]?.textContent.toLowerCase() || '';
        const categoria = row.cells[2]?.textContent.toLowerCase() || '';
        if (!codigo.includes(searchTerm) && !nombre.includes(searchTerm) && !categoria.includes(searchTerm)) {
          visible = false;
        }
      }

      if (visible) {
        visibleCount++;
      }
      return visible;
    });

    const countLabel = document.getElementById('productCountLabel');
    if (countLabel) {
      countLabel.textContent = `${visibleCount} de ${totalCount} productos en catálogo`;
    }
  }

  clearSearch() {
    if (this.tableManager) {
      this.tableManager.clearFilters();
    }
    const todasBtn = document.querySelector('.category-filter-btn[data-categoria-id=""]');
    if (todasBtn) {
      todasBtn.click();
    }
  }
}
window.ProductManager = ProductManager;
