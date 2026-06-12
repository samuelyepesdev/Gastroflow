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
