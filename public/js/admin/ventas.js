(function () {
    var tbodyVentas = document.getElementById('tbodyVentas');
    var searchFactura = document.getElementById('searchFactura');
    var payFilters = document.querySelectorAll('[data-pay-filter]');
    
    var shownInvoicesCount = document.getElementById('shownInvoicesCount');
    var shownTotalAmount = document.getElementById('shownTotalAmount');
    var deletedSessionCountEl = document.getElementById('deletedSessionCount');
    var noVentasMsg = document.getElementById('noVentasMsg');

    var currentPayFilter = 'todos';
    var deletedCount = 0;

    // Función de filtrado y recálculo
    function applyFilters() {
        var searchQuery = searchFactura ? searchFactura.value.trim().toLowerCase() : '';
        var visibleCount = 0;
        var visibleTotal = 0;

        var rows = document.querySelectorAll('.venta-row');
        rows.forEach(function (row) {
            var num = row.getAttribute('data-numero').toLowerCase();
            var cliente = row.getAttribute('data-cliente').toLowerCase();
            var payMethod = row.getAttribute('data-forma-pago').toLowerCase();
            var total = parseFloat(row.getAttribute('data-total') || '0');

            var matchesSearch = !searchQuery || num.indexOf(searchQuery) >= 0 || cliente.indexOf(searchQuery) >= 0;
            var matchesPay = currentPayFilter === 'todos' || payMethod === currentPayFilter;

            if (matchesSearch && matchesPay) {
                row.style.display = '';
                visibleCount++;
                visibleTotal += total;
            } else {
                row.style.display = 'none';
            }
        });

        // Actualizar estadísticas en tiempo real
        if (shownInvoicesCount) shownInvoicesCount.textContent = visibleCount;
        if (shownTotalAmount) {
            shownTotalAmount.textContent = '$' + Math.round(visibleTotal).toLocaleString('es-CO');
        }

        // Mostrar u ocultar mensaje sin resultados
        if (noVentasMsg) {
            noVentasMsg.style.display = visibleCount === 0 ? 'block' : 'none';
        }
    }

    // Escuchar cambios en buscador
    if (searchFactura) {
        searchFactura.addEventListener('input', applyFilters);
    }

    // Escuchar cambios en segmentadores de forma de pago
    payFilters.forEach(function (btn) {
        btn.addEventListener('click', function () {
            payFilters.forEach(function (b) { b.classList.remove('active'); });
            this.classList.add('active');
            currentPayFilter = this.getAttribute('data-pay-filter');
            applyFilters();
        });
    });

    // ─── Modificar venta ───────────────────────────────────────────
    var modalEditarEl = document.getElementById('modalEditarVenta');
    var modalEditar = modalEditarEl ? new bootstrap.Modal(modalEditarEl) : null;
    var formEditar = document.getElementById('formEditarVenta');
    var formaPagoSelect = document.getElementById('editVentaFormaPago');
    var mixtoWrap = document.getElementById('editVentaMixtoWrap');
    var editEfectivo = document.getElementById('editVentaEfectivo');
    var editTransferencia = document.getElementById('editVentaTransferencia');
    var editTotal = document.getElementById('editVentaTotal');
    var mixtoAyuda = document.getElementById('editVentaMixtoAyuda');

    function actualizarAyudaMixto() {
        if (!mixtoAyuda) return;
        var total = parseFloat(editTotal.value) || 0;
        var efectivo = parseFloat(editEfectivo.value) || 0;
        var transferencia = parseFloat(editTransferencia.value) || 0;
        var restante = total - efectivo - transferencia;
        if (Math.abs(restante) <= 0.01) {
            mixtoAyuda.textContent = 'Efectivo + transferencia cuadra con el total.';
            mixtoAyuda.className = 'text-success';
        } else {
            mixtoAyuda.textContent = 'Falta $' + restante.toFixed(2) + ' para cuadrar con el total.';
            mixtoAyuda.className = restante < 0 ? 'text-danger' : 'text-warning';
        }
    }

    function toggleMixto() {
        if (!mixtoWrap || !formaPagoSelect) return;
        var esMixto = formaPagoSelect.value === 'mixto';
        mixtoWrap.classList.toggle('d-none', !esMixto);
        editEfectivo.required = esMixto;
        editTransferencia.required = esMixto;
        if (esMixto) actualizarAyudaMixto();
    }

    if (formaPagoSelect) {
        formaPagoSelect.addEventListener('change', toggleMixto);
    }
    if (editEfectivo) editEfectivo.addEventListener('input', actualizarAyudaMixto);
    if (editTransferencia) editTransferencia.addEventListener('input', actualizarAyudaMixto);
    if (editTotal) editTotal.addEventListener('input', actualizarAyudaMixto);

    if (tbodyVentas) {
        tbodyVentas.addEventListener('click', function (e) {
            var btnEdit = e.target.closest('.btn-editar-venta-row');
            if (!btnEdit) return;

            var id = btnEdit.getAttribute('data-id');
            if (!id) return;

            fetch('/admin/ventas/' + id, { credentials: 'same-origin' })
                .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
                .then(function (o) {
                    if (!o.ok) {
                        Swal.fire({ icon: 'error', title: 'No se pudo cargar la venta', text: o.data.error || '' });
                        return;
                    }
                    var f = o.data;
                    document.getElementById('editVentaId').value = f.id;
                    document.getElementById('editVentaNumero').textContent = '#' + (f.numero != null ? f.numero : f.id) + ' — ' + (f.tenant_nombre || '');
                    document.getElementById('editVentaCliente').value = f.cliente_nombre || '';
                    document.getElementById('editVentaFormaPago').value = f.forma_pago || 'efectivo';
                    document.getElementById('editVentaTotal').value = f.total;
                    document.getElementById('editVentaPropina').value = f.propina || 0;
                    document.getElementById('editVentaFecha').value = f.fecha;
                    editEfectivo.value = f.monto_efectivo || 0;
                    editTransferencia.value = f.monto_transferencia || 0;
                    toggleMixto();
                    if (modalEditar) modalEditar.show();
                })
                .catch(function () {
                    Swal.fire({ icon: 'error', title: 'Error de conexión', text: 'No se pudo contactar al servidor.' });
                });
        });
    }

    if (formEditar) {
        formEditar.addEventListener('submit', function (e) {
            e.preventDefault();
            var id = document.getElementById('editVentaId').value;
            var btnGuardar = document.getElementById('btnGuardarEditVenta');
            var originalText = btnGuardar.innerHTML;
            btnGuardar.disabled = true;
            btnGuardar.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Guardando...';

            var payload = {
                cliente_nombre: document.getElementById('editVentaCliente').value,
                forma_pago: document.getElementById('editVentaFormaPago').value,
                total: document.getElementById('editVentaTotal').value,
                propina: document.getElementById('editVentaPropina').value,
                fecha: document.getElementById('editVentaFecha').value,
                monto_efectivo: editEfectivo.value,
                monto_transferencia: editTransferencia.value
            };

            fetch('/admin/ventas/' + id, {
                method: 'PUT',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
                .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
                .then(function (o) {
                    if (!o.ok) {
                        Swal.fire({ icon: 'error', title: 'No se pudo guardar', text: o.data.error || '' });
                        return;
                    }
                    if (modalEditar) modalEditar.hide();
                    // Recargamos para que la fila (cliente, badge de pago, total, fecha)
                    // se vea igual que si se hubiera cargado desde cero.
                    window.location.reload();
                })
                .catch(function () {
                    Swal.fire({ icon: 'error', title: 'Error de conexión', text: 'No se pudo contactar al servidor.' });
                })
                .finally(function () {
                    btnGuardar.disabled = false;
                    btnGuardar.innerHTML = originalText;
                });
        });
    }

    // Event Delegation para eliminar factura
    if (tbodyVentas) {
        tbodyVentas.addEventListener('click', function (e) {
            var btn = e.target.closest('.btn-eliminar-venta-row');
            if (!btn) return;

            var id = btn.getAttribute('data-id');
            var numero = btn.getAttribute('data-numero') || id;
            var cliente = btn.getAttribute('data-cliente') || '';
            var total = btn.getAttribute('data-total') || '0';
            var tenant = btn.getAttribute('data-tenant') || '';

            if (!id) return;

            // Modal SweetAlert2 Premium adaptado al diseño de GastroFlow
            Swal.fire({
                title: '¿Eliminar la factura #' + numero + '?',
                html: '<div style="margin: 10px 0 18px; text-align: center;">' +
                      '<div style="font-size: 13.5px; color: #6b7585; line-height: 1.5; font-family: \'Plus Jakarta Sans\', sans-serif;">' +
                      'Se eliminará permanentemente del sistema.<br>Esta acción <strong style="color: #dc2626;">no se puede deshacer.</strong>' +
                      '</div>' +
                      '<div style="margin-top: 14px; padding: 14px; border-radius: 12px; background: #f8f9fb; border: 1px solid #eceef1; text-align: left; display: flex; flex-direction: column; gap: 9px; font-family: \'Plus Jakarta Sans\', sans-serif; font-size: 12.5px;">' +
                      '<div style="display: flex; justify-content: space-between;"><strong>Restaurante:</strong> <span>' + tenant + '</span></div>' +
                      '<div style="display: flex; justify-content: space-between;"><strong>Cliente:</strong> <span>' + cliente + '</span></div>' +
                      '<div style="display: flex; justify-content: space-between; font-size: 14.5px; border-top: 1px dashed #e2e5ea; padding-top: 9px;"><strong>Total:</strong> <strong style="color: #0f172a;">$' + Math.round(parseFloat(total)).toLocaleString('es-CO') + '</strong></div>' +
                      '</div>' +
                      '</div>',
                icon: 'warning',
                iconColor: '#dc2626',
                showCancelButton: true,
                confirmButtonText: 'Sí, eliminar',
                cancelButtonText: 'Cancelar',
                customClass: {
                    confirmButton: 'btn btn-danger px-4 py-2 rounded-3 fs-14 fw-bold mx-1',
                    cancelButton: 'btn btn-outline-secondary px-4 py-2 rounded-3 fs-14 fw-bold mx-1'
                },
                buttonsStyling: false
            }).then(function (result) {
                if (!result.isConfirmed) return;

                // Petición AJAX al backend para eliminar
                fetch('/admin/ventas/' + id, {
                    method: 'DELETE',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json' }
                })
                .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
                .then(function (o) {
                    if (o.ok) {
                        const Toast = Swal.mixin({
                            toast: true,
                            position: 'top-end',
                            showConfirmButton: false,
                            timer: 2000,
                            timerProgressBar: true
                        });
                        Toast.fire({
                            icon: 'success',
                            title: o.data.message || 'Factura eliminada correctamente'
                        });

                        // Eliminar fila
                        var row = document.querySelector('tr[data-factura-id="' + id + '"]');
                        if (row) row.remove();

                        // Incrementar contador de sesión
                        deletedCount++;
                        if (deletedSessionCountEl) {
                            deletedSessionCountEl.textContent = deletedCount;
                        }

                        // Reaplicar filtros y recálculos
                        applyFilters();
                    } else {
                        Swal.fire({ 
                            icon: 'error', 
                            title: 'Error al eliminar', 
                            text: o.data.error || 'No se pudo eliminar la factura.' 
                        });
                    }
                })
                .catch(function () { 
                    Swal.fire({ 
                        icon: 'error', 
                        title: 'Error de conexión', 
                        text: 'No se pudo contactar al servidor.' 
                    }); 
                });
            });
        });
    }
})();
