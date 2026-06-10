(function () {
    const selectTenant = document.getElementById('selectTenant');
    const btnCargar = document.getElementById('btnCargar');
    const tbodyVentas = document.getElementById('tbodyVentas');

    if (selectTenant) {
        selectTenant.addEventListener('change', function () {
            var id = this.value;
            window.location.href = '/admin/ventas?tenantId=' + encodeURIComponent(id);
        });
    }

    if (btnCargar) {
        btnCargar.addEventListener('click', function () {
            var id = selectTenant.value;
            window.location.href = '/admin/ventas?tenantId=' + encodeURIComponent(id);
        });
    }

    if (tbodyVentas) {
        tbodyVentas.addEventListener('click', function (e) {
            var btn = e.target.closest('.btn-eliminar-venta');
            if (!btn) return;
            var id = btn.getAttribute('data-id');
            var numero = btn.getAttribute('data-numero') || id;
            var cliente = btn.getAttribute('data-cliente') || '';
            var total = btn.getAttribute('data-total') || '0';
            if (!id) return;
            Swal.fire({
                title: '¿Eliminar esta venta?',
                html: 'Factura #' + numero + '<br>Cliente: ' + cliente + '<br>Total: $' + parseFloat(total).toFixed(2) + '<br><strong>Esta acción no se puede deshacer.</strong>',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#dc3545',
                cancelButtonText: 'Cancelar',
                confirmButtonText: 'Sí, eliminar'
            }).then(function (result) {
                if (!result.isConfirmed) return;
                fetch('/admin/ventas/' + id, {
                    method: 'DELETE',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json' }
                })
                    .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
                    .then(function (o) {
                        if (o.ok) {
                            Swal.fire({ icon: 'success', title: o.data.message || 'Venta eliminada' });
                            var row = document.querySelector('tr[data-factura-id="' + id + '"]');
                            if (row) row.remove();
                        } else {
                            Swal.fire({ icon: 'error', title: o.data.error || 'Error' });
                        }
                    })
                    .catch(function () { Swal.fire({ icon: 'error', title: 'Error de conexión' }); });
            });
        });
    }
})();
