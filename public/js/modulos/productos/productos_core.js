// Core state, Class, and Methods for Products module

class ProductManager {
  constructor() {
    this.formManager = null;
    this.tableManager = null;
    this.searchManager = null;
    this._costeoProductoId = null;
    this._costeoData = null;
    this.init();
  }

  async toggleFavorite(id, nuevoEstado, btn) {
    try {
      await fetch(`/api/productos/${id}/favorito`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ es_favorito: nuevoEstado })
      }).then(res => { if (!res.ok) throw new Error('Error al actualizar favorito'); });

      btn.data('favorito', nuevoEstado);
      btn.attr('title', nuevoEstado ? 'Quitar de favoritos' : 'Agregar a favoritos');
      const icon = btn.find('i');
      if (nuevoEstado) {
        icon.removeClass('bi-star text-muted').addClass('bi-star-fill text-warning');
      } else {
        icon.removeClass('bi-star-fill text-warning').addClass('bi-star text-muted');
      }
    } catch (error) {
      AlertManager.alert(error.message, 'error');
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
      const data = await fetch(`/costeo/api/costeo/producto/${productoId}`, {
        headers: { 'Accept': 'application/json' },
        credentials: 'same-origin'
      }).then(res => {
        if (!res.ok) return res.json().then(j => { throw new Error(j.error || res.statusText); });
        return res.json();
      });
      this._costeoData = data;
      const fmt = (n) => n != null && !Number.isNaN(n) ? new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) : '-';
      document.getElementById('costeoDirecto').textContent = '$' + fmt(data.costo_materia_prima_porcion ?? data.costo_directo_porcion);
      const mermaPctEl = document.getElementById('costeoMermaPct');
      if (mermaPctEl) mermaPctEl.textContent = data.merma_pct != null ? data.merma_pct : '0';
      document.getElementById('costeoIndirecto').textContent = '$' + fmt(data.merma_monto ?? data.costo_indirecto);
      document.getElementById('costeoTotal').textContent = '$' + fmt(data.costo_total_porcion);
      document.getElementById('costeoPrecioSug').textContent = '$' + fmt(data.precio_sugerido);
      document.getElementById('costeoPrecioActual').textContent = '$' + fmt(data.precio_venta_actual);
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

  async aplicarPrecioSugerido() {
    const id = this._costeoProductoId;
    const data = this._costeoData;
    if (!id || !data || data.precio_sugerido == null) return;
    try {
      await ApiClient.put(`/api/productos/${id}/precio`, { precio_unidad: data.precio_sugerido });
      bootstrap.Modal.getInstance(document.getElementById('costeoProductoModal'))?.hide();
      Utils.reload();
    } catch (error) {
      AlertManager.alert(error.message || 'Error al actualizar precio', 'error');
    }
  }

  async handleSubmit(data, isEdit, id) {
    const productData = {
      codigo: data.codigo || document.getElementById('codigo').value,
      nombre: data.nombre || document.getElementById('nombre').value,
      categoria_id: data.categoriaId || document.getElementById('categoriaId').value,
      precio_unidad: Number.parseFloat(data.precioUnidad || document.getElementById('precioUnidad').value) || 0,
      descripcion: document.getElementById('descripcion') ? document.getElementById('descripcion').value : '',
      imagen_url: document.getElementById('imagenUrl')?.value || null,
      tributo: document.getElementById('tributo')?.value || null
    };

    try {
      if (isEdit) {
        await ApiClient.put(`/api/productos/${id}`, productData);
        
        try {
          const checkboxes = document.querySelectorAll('#productoParametrosCheckboxes .producto-parametro-cb:checked');
          if (checkboxes.length > 0 || document.getElementById('productoParametrosCheckboxes')) {
            const parametroIds = Array.from(checkboxes).map(cb => Number.parseInt(cb.value, 10));
            const r = await fetch('/costeo/api/productos/' + id + '/parametros', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'same-origin',
              body: JSON.stringify({ parametro_ids: parametroIds })
            });
            if (!r.ok && r.status !== 403) throw new Error('Error al guardar parámetros de costeo');
          }
        } catch (costeoErr) {
          console.warn('No se pudieron guardar parámetros de costeo (posiblemente por restricciones de plan):', costeoErr);
        }
        
        AlertManager.success('Producto actualizado correctamente');
      } else {
        await ApiClient.post('/api/productos', productData);
        AlertManager.success('Producto creado correctamente');
      }

      this.formManager.hide();

      setTimeout(() => {
        Utils.reload();
      }, 1000);
    } catch (error) {
      console.error('Error saving product:', error);
      const errorMessage = error.message || 'Hubo un problema al guardar el producto. Por favor, intente de nuevo.';
      if (error.message?.includes('fetch')) {
        AlertManager.error('Error de conexión: No se pudo comunicar con el servidor.');
      } else {
        AlertManager.error(errorMessage);
      }
    }
  }

  async handleEdit(id) {
    try {
      const producto = await ApiClient.get(`/api/productos/${id}`);
      document.getElementById('productoId').value = producto.id;
      document.getElementById('codigo').value = producto.codigo;
      document.getElementById('nombre').value = producto.nombre;
      document.getElementById('categoriaId').value = producto.categoria_id || '';
      document.getElementById('precioUnidad').value = producto.precio_unidad;
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
        try {
          const [resAll, resProd] = await Promise.all([
            fetch('/costeo/api/parametros', { credentials: 'same-origin' }),
            fetch('/costeo/api/productos/' + id + '/parametros', { credentials: 'same-origin' })
          ]);

          if (resAll.status === 403 || resProd.status === 403) {
            paramContainer.classList.add('d-none');
            return;
          }

          const allParams = resAll.ok ? await resAll.json() : [];
          const productParams = resProd.ok ? await resProd.json() : [];

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
            label.innerHTML = `<input type="checkbox" class="form-check-input me-2 producto-parametro-cb" value="${p.id}" ${assignedIds.has(p.id) ? 'checked' : ''}> ${p.name}`;
            div.appendChild(label);
          });
        } catch (e) {
          console.log('Modulo de costeo no disponible o error de red:', e);
          paramContainer.classList.add('d-none');
        }
      }
    } catch (error) {
      AlertManager.alert('Error al cargar el producto', 'error');
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
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });
    if (!result.isConfirmed) return;

    try {
      await ApiClient.delete(`/api/productos/${id}`);
      await Swal.fire({ icon: 'success', title: 'Producto eliminado', timer: 1500, showConfirmButton: false });
      Utils.reload();
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
