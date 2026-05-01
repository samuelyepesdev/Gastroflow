/**
 * Productos Manager - Refactored using modular architecture
 * Manages product CRUD operations
 * Related to: views/productos.ejs, routes/productos.js, modules/ApiClient.js, modules/FormManager.js, etc.
 */

// Product manager class
class ProductManager {
    constructor() {
        this.formManager = null;
        this.tableManager = null;
        this.searchManager = null;
        this.init();
    }

    /**
     * Initialize product manager
     */
    init() {
        // Initialize form manager
        this.formManager = new FormManager({
            modalId: 'nuevoProductoModal',
            formId: 'formProducto',
            submitButtonId: 'guardarProducto',
            titleElementId: 'modalTitle',
            createTitle: 'Nuevo Producto',
            editTitle: 'Editar Producto',
            resetFields: ['productoId', 'categoriaId'],
            onSubmit: (data, isEdit, id) => this.handleSubmit(data, isEdit, id),
            onEdit: (id) => this.handleEdit(id)
        });

        // Initialize table manager
        this.tableManager = new TableManager({
            tableBodyId: 'productosTabla',
            onEdit: (id) => this.editProduct(id),
            onDelete: (id) => this.deleteProduct(id),
            onCosteo: (id) => this.showCosteoModal(id),
            deleteConfirmMessage: '¿Está seguro de eliminar este producto?'
        });

        // Initialize search manager
        const searchInput = document.getElementById('buscarProducto');
        if (searchInput) {
            this.searchManager = new SearchManager(
                searchInput,
                (searchTerm) => this.applyFilters(),
                {
                    debounceMs: 300,
                    minLength: 0,
                    onClear: () => this.applyFilters()
                }
            );
        }

        // Setup category filter
        const categoriaFilter = document.getElementById('filtroCategoria');
        if (categoriaFilter) {
            categoriaFilter.addEventListener('change', () => this.applyFilters());
        }

        // Setup keyboard shortcuts
        this.setupKeyboardShortcuts();

        // Setup import/export buttons
        this.setupImportExport();

        // Setup modal event for new product (solo reset cuando se abre para crear, no al editar)
        const modal = document.getElementById('nuevoProductoModal');
        if (modal) {
            modal.addEventListener('show.bs.modal', (e) => {
                const esModoEdicion = this.formManager.isEditMode;
                if (!e.relatedTarget && !esModoEdicion) {
                    this.formManager.resetForm();
                    document.getElementById('productoParametrosContainer')?.classList.add('d-none');
                    setTimeout(() => {
                        document.getElementById('codigo')?.focus();
                    }, 500);
                }
                if (esModoEdicion) {
                    document.getElementById('productoParametrosContainer')?.classList.remove('d-none');
                }
            });
        }

        // Costeo modal: aplicar precio sugerido
        const btnAplicar = document.getElementById('btnAplicarPrecioSugerido');
        if (btnAplicar) {
            btnAplicar.addEventListener('click', () => this.aplicarPrecioSugerido());
        }

        // Favoritos: toggle
        $(document).on('click', '.btn-toggle-favorito', (e) => {
            const btn = $(e.currentTarget);
            const id = btn.data('id');
            const esFav = btn.data('favorito');
            this.toggleFavorite(id, !esFav, btn);
        });
    }

    /**
     * Toggle favorite status
     */
    async toggleFavorite(id, nuevoEstado, btn) {
        try {
            await fetch(`/api/productos/${id}/favorito`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ es_favorito: nuevoEstado })
            }).then(res => { if (!res.ok) throw new Error('Error al actualizar favorito'); });

            // Update UI
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

    /**
     * Show costeo modal for a product (must have linked recipe)
     */
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
                if (!res.ok) return res.json().then(j => Promise.reject(new Error(j.error || res.statusText)));
                return res.json();
            });
            this._costeoData = data;
            const fmt = (n) => n != null && !isNaN(n) ? new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) : '-';
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

    /**
     * Apply suggested price from costeo to product
     */
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

    /**
     * Handle form submission
     */
    async handleSubmit(data, isEdit, id) {
        const productData = {
            codigo: data.codigo || document.getElementById('codigo').value,
            nombre: data.nombre || document.getElementById('nombre').value,
            categoria_id: data.categoriaId || document.getElementById('categoriaId').value,
            precio_unidad: parseFloat(data.precioUnidad || document.getElementById('precioUnidad').value) || 0,
            descripcion: document.getElementById('descripcion') ? document.getElementById('descripcion').value : ''
        };

        try {
            if (isEdit) {
                await ApiClient.put(`/api/productos/${id}`, productData);
                
                // Actualización de parámetros de costeo (Opcional según el plan)
                try {
                    const checkboxes = document.querySelectorAll('#productoParametrosCheckboxes .producto-parametro-cb:checked');
                    if (checkboxes.length > 0 || document.getElementById('productoParametrosCheckboxes')) {
                        const parametroIds = Array.from(checkboxes).map(cb => parseInt(cb.value, 10));
                        const r = await fetch('/costeo/api/productos/' + id + '/parametros', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'same-origin',
                            body: JSON.stringify({ parametro_ids: parametroIds })
                        });
                        // Solo lanzamos error si no es un problema de permisos (403)
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

            // Ocultar el modal antes de recargar
            this.formManager.hide();

            // Esperar un momento para que el usuario vea el toast antes de recargar
            setTimeout(() => {
                Utils.reload();
            }, 1000);
        } catch (error) {
            console.error('Error saving product:', error);
            // Mostrar error detallado utilizando SweetAlert2 si está disponible a través de AlertManager
            const errorMessage = error.message || 'Hubo un problema al guardar el producto. Por favor, intente de nuevo.';
            if (error.message && error.message.includes('fetch')) {
                AlertManager.error('Error de conexión: No se pudo comunicar con el servidor.');
            } else {
                AlertManager.error(errorMessage);
            }
        }
    }

    /**
     * Handle edit - load product data and parametros for costeo filter
     */
    async handleEdit(id) {
        try {
            const producto = await ApiClient.get(`/api/productos/${id}`);
            document.getElementById('productoId').value = producto.id;
            document.getElementById('codigo').value = producto.codigo;
            document.getElementById('nombre').value = producto.nombre;
            document.getElementById('categoriaId').value = producto.categoria_id || '';
            document.getElementById('precioUnidad').value = producto.precio_unidad;
            if (document.getElementById('descripcion')) {
                document.getElementById('descripcion').value = producto.descripcion || '';
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

    /**
     * Edit product
     */
    editProduct(id) {
        this.formManager.showEdit(id);
    }

    /**
     * Delete product
     */
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

    /**
     * Handle search - now combined with category filter
     */
    handleSearch(searchTerm) {
        this.applyFilters();
    }

    /**
     * Apply filters (search text + category)
     */
    applyFilters() {
        if (!this.tableManager) return;

        const searchTerm = (document.getElementById('buscarProducto')?.value || '').toLowerCase();
        const categoriaId = document.getElementById('filtroCategoria')?.value || '';

        this.tableManager.filterRows((row) => {
            // Filter by category
            if (categoriaId) {
                const rowCategoriaId = row.getAttribute('data-categoria-id') || '';
                if (rowCategoriaId !== categoriaId) {
                    return false;
                }
            }

            // Filter by search term
            if (searchTerm) {
                const codigo = row.cells[0]?.textContent.toLowerCase() || '';
                const nombre = row.cells[1]?.textContent.toLowerCase() || '';
                const categoria = row.cells[2]?.textContent.toLowerCase() || '';
                if (!codigo.includes(searchTerm) && !nombre.includes(searchTerm) && !categoria.includes(searchTerm)) {
                    return false;
                }
            }

            return true;
        });
    }

    /**
     * Clear search
     */
    clearSearch() {
        if (this.tableManager) {
            this.tableManager.clearFilters();
        }
        if (document.getElementById('filtroCategoria')) {
            document.getElementById('filtroCategoria').value = '';
        }
    }

    /**
     * Setup keyboard shortcuts
     */
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            if (e.ctrlKey || e.metaKey) {
                switch (e.key.toLowerCase()) {
                    case 'b':
                        e.preventDefault();
                        document.getElementById('buscarProducto')?.focus();
                        break;
                    case 'n':
                        e.preventDefault();
                        this.formManager.showCreate();
                        document.getElementById('codigo')?.focus();
                        break;
                }
            } else if (e.key === '/') {
                e.preventDefault();
                document.getElementById('buscarProducto')?.focus();
            }
        });
    }

    /**
     * Setup import/export functionality
     */
    setupImportExport() {
        // Download template
        const btnDescargarPlantilla = document.getElementById('btnDescargarPlantilla');
        if (btnDescargarPlantilla) {
            btnDescargarPlantilla.addEventListener('click', () => {
                window.open('/api/productos/plantilla', '_blank');
            });
        }

        // Import products
        const btnImportar = document.getElementById('btnImportarProductos');
        const inputImport = document.getElementById('archivoImport');

        if (btnImportar && inputImport) {
            btnImportar.addEventListener('click', () => inputImport.click());

            inputImport.addEventListener('change', async (e) => {
                if (!e.target.files.length) return;

                const formData = new FormData();
                formData.append('archivo', e.target.files[0]);

                btnImportar.disabled = true;
                btnImportar.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Importando...';

                try {
                    const response = await fetch('/api/productos/importar', {
                        method: 'POST',
                        body: formData
                    });

                    const data = await response.json();

                    if (!response.ok) {
                        throw new Error(data.error || 'Error al importar');
                    }

                    let html = `<div class="text-start small">
                        <div class="mb-1"><i class="bi bi-plus-circle text-success me-2"></i>Nuevos: <strong>${data.inserted}</strong></div>
                        <div class="mb-1"><i class="bi bi-arrow-repeat text-primary me-2"></i>Actualizados: <strong>${data.updated}</strong></div>
                    </div>`;

                    if (data.errores && data.errores.length > 0) {
                        html += `<hr><div class="text-start small text-danger">
                            <strong><i class="bi bi-exclamation-triangle me-1"></i> Errores (${data.errores.length}):</strong>
                            <div class="mt-2 p-2 bg-light border rounded" style="max-height: 100px; overflow-y: auto; font-size: 0.75rem;">
                                ${data.errores.map(e => `• Fila ${e.fila}: ${e.mensaje}`).join('<br>')}
                            </div>
                        </div>`;
                    }

                    await Swal.fire({
                        icon: data.errores?.length > 0 ? (data.inserted + data.updated > 0 ? 'warning' : 'error') : 'success',
                        title: 'Importación Finalizada',
                        html: html,
                        confirmButtonText: 'Entendido'
                    });
                    
                    if (data.inserted > 0 || data.updated > 0) {
                        Utils.reload();
                    }
                } catch (error) {
                    AlertManager.alert(error.message, 'error');
                } finally {
                    btnImportar.disabled = false;
                    btnImportar.innerHTML = '<i class="bi bi-upload"></i> Importar Excel';
                    e.target.value = '';
                }
            });
        }
    }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    window.productManager = new ProductManager();
});

// Export functions for backward compatibility
function editarProducto(id) {
    if (window.productManager) {
        window.productManager.editProduct(id);
    }
}

function eliminarProducto(id) {
    if (window.productManager) {
        window.productManager.deleteProduct(id);
    }
}

