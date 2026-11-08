(function () {
    var tbodyVentas = document.getElementById('tbodyVentas');
    var searchFactura = document.getElementById('searchFactura');
    var formFiltros = document.getElementById('formFiltrosVentas');

    var shownInvoicesCount = document.getElementById('shownInvoicesCount');
    var shownTotalAmount = document.getElementById('shownTotalAmount');
    var deletedSessionCountEl = document.getElementById('deletedSessionCount');
    var noVentasMsg = document.getElementById('noVentasMsg');

    var deletedCount = 0;

    // El filtrado (búsqueda y forma de pago) lo hace el servidor para poder paginar:
    // el formulario GET recarga la lista desde la página 1. La búsqueda se envía sola
    // al dejar de escribir.
    var debounceBusqueda = null;
    if (searchFactura && formFiltros) {
        searchFactura.addEventListener('input', function () {
            clearTimeout(debounceBusqueda);
            debounceBusqueda = setTimeout(function () { formFiltros.submit(); }, 500);
        });
    }

    function parseMonto(texto) {
        return parseFloat(String(texto || '0').replace(/[^\d]/g, '')) || 0;
    }

    // Tras eliminar una fila: ajusta los totales (de todas las páginas) y, si la página
    // quedó vacía, recarga para traer filas de la siguiente (o ir a la página anterior).
    function actualizarTrasEliminar(totalEliminado) {
        if (shownInvoicesCount) {
            var n = parseMonto(shownInvoicesCount.textContent) - 1;
            shownInvoicesCount.textContent = Math.max(n, 0).toLocaleString('es-CO');
        }
        if (shownTotalAmount) {
            var monto = parseMonto(shownTotalAmount.textContent) - Math.round(totalEliminado);
            shownTotalAmount.textContent = '$' + Math.max(monto, 0).toLocaleString('es-CO');
        }
        if (document.querySelectorAll('.venta-row').length === 0) {
            // El servidor ajusta la página si ya no existe; con filas restantes muestra la misma.
            window.location.reload();
        }
    }

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

            GF.api('/admin/ventas/' + id)
                .then(function (f) {
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
                .catch(function (err) {
                    Swal.fire({ icon: 'error', title: 'No se pudo cargar la venta', text: err.message });
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

            GF.api.put('/admin/ventas/' + id, payload)
                .then(function () {
                    if (modalEditar) modalEditar.hide();
                    // Recargamos para que la fila (cliente, badge de pago, total, fecha)
                    // se vea igual que si se hubiera cargado desde cero.
                    window.location.reload();
                })
                .catch(function (err) {
                    Swal.fire({ icon: 'error', title: 'No se pudo guardar', text: err.message });
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
                      '<div style="font-size: 13.5px; color: #6b7585; line-height: 1.5; font-family: \'Poppins\', sans-serif;">' +
                      'Se eliminará permanentemente del sistema.<br>Esta acción <strong style="color: #dc2626;">no se puede deshacer.</strong>' +
                      '</div>' +
                      '<div style="margin-top: 14px; padding: 14px; border-radius: 12px; background: #fff9f2; border: 1px solid #efe8dd; text-align: left; display: flex; flex-direction: column; gap: 9px; font-family: \'Poppins\', sans-serif; font-size: 12.5px;">' +
                      '<div style="display: flex; justify-content: space-between;"><strong>Restaurante:</strong> <span>' + tenant + '</span></div>' +
                      '<div style="display: flex; justify-content: space-between;"><strong>Cliente:</strong> <span>' + cliente + '</span></div>' +
                      '<div style="display: flex; justify-content: space-between; font-size: 14.5px; border-top: 1px dashed #e4dccf; padding-top: 9px;"><strong>Total:</strong> <strong style="color: #0e1b2c;">$' + Math.round(parseFloat(total)).toLocaleString('es-CO') + '</strong></div>' +
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
                GF.api.delete('/admin/ventas/' + id)
                .then(function (data) {
                    GF.toast((data && data.message) || 'Factura eliminada correctamente', 'success', { timer: 2000 });

                    // Eliminar fila
                    var row = document.querySelector('tr[data-factura-id="' + id + '"]');
                    if (row) row.remove();

                    // Incrementar contador de sesión
                    deletedCount++;
                    if (deletedSessionCountEl) {
                        deletedSessionCountEl.textContent = deletedCount;
                    }

                    actualizarTrasEliminar(parseFloat(total) || 0);
                })
                .catch(function (err) {
                    Swal.fire({ icon: 'error', title: 'Error al eliminar', text: err.message || 'No se pudo eliminar la factura.' });
                });
            });
        });
    }
})();
