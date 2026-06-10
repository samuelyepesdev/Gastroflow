function getFacturaModal() {
    var el = document.getElementById('facturaModal');
    return el ? bootstrap.Modal.getOrCreateInstance(el) : null;
}
function getDetallesModal() {
    var el = document.getElementById('detallesModal');
    return el ? bootstrap.Modal.getOrCreateInstance(el) : null;
}

function mostrarAlerta(mensaje, tipo) {
    tipo = tipo || 'success';
    var alertaDiv = document.createElement('div');
    alertaDiv.className = 'custom-alert ' + tipo;
    alertaDiv.innerHTML = '<div class="alert-content"><i class="bi ' + (tipo === 'success' ? 'bi-check-circle' : tipo === 'error' ? 'bi-x-circle' : 'bi-exclamation-triangle') + ' me-2"></i>' + mensaje + '</div><button type="button" class="btn-close btn-close-white ms-3" onclick="this.parentElement.remove()"></button>';
    document.body.appendChild(alertaDiv);
    setTimeout(function () { alertaDiv.remove(); }, 5000);
}

function mostrarFactura(id, numeroDisplay) {
    var modalEl = document.getElementById('facturaModal');
    var frameEl = document.getElementById('facturaFrame');
    var titleEl = modalEl && modalEl.querySelector('.modal-title');
    if (!modalEl || !frameEl) return;
    if (titleEl) titleEl.textContent = 'Factura #' + (numeroDisplay != null ? numeroDisplay : id);
    frameEl.src = '/api/facturas/' + id + '/imprimir?return=' + encodeURIComponent('/ventas');
    var modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

function mostrarDetalles(id) {
    $.ajax({
        url: '/api/facturas/' + id + '/detalles',
        success: function (data) {
            if (!data || !data.factura) {
                mostrarAlerta('No se encontraron detalles de la factura', 'error');
                return;
            }
            var cliente = data.cliente || {};
            var factura = data.factura || {};
            $('#detallesCliente').html('<p><strong>Nombre:</strong> ' + (cliente.nombre || '-') + '</p><p><strong>Dirección:</strong> ' + (cliente.direccion || 'No especificada') + '</p><p><strong>Teléfono:</strong> ' + (cliente.telefono || 'No especificado') + '</p>');
            var facturaHtml = '<p><strong>Factura #:</strong> ' + (factura.numero != null ? factura.numero : factura.id) + '</p><p><strong>Fecha:</strong> ' + ((factura.fechaISO || factura.fecha) ? new Date(factura.fechaISO || factura.fecha).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'medium' }) : '-') + '</p><p><strong>Forma de Pago:</strong> ' + (factura.forma_pago ? (factura.forma_pago.charAt(0).toUpperCase() + factura.forma_pago.slice(1)) : '-') + '</p>';
            if (factura.propina != null && Number(factura.propina) > 0) {
                facturaHtml += '<p><strong>Propina:</strong> $' + (Number(factura.propina) || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</p>';
            }
            $('#detallesFactura').html(facturaHtml);
            var tbody = $('#detallesProductos');
            tbody.empty();
            var totalGeneral = 0;
            var productos = data.productos || [];
            var fmtNum = function (n) { return (Number(n) || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
            productos.forEach(function (producto) {
                var cantidad = Number(producto.cantidad) || 0;
                var precio = Number(producto.precio) || 0;
                var subtotal = Number(producto.subtotal) || 0;
                totalGeneral += subtotal;
                const serviceBadge = producto.es_servicio ? ' <span class="badge bg-info text-dark" style="font-size: 0.6rem;">Servicio</span>' : '';
                tbody.append('<tr>' +
                    '<td><div class="fw-medium">' + (producto.nombre || '') + serviceBadge + '</div>' +
                    '<div class="d-block d-md-none small text-muted">A $' + fmtNum(precio) + ' / ' + (producto.unidad || 'N/A') + '</div></td>' +
                    '<td class="text-end align-middle">' + fmtNum(cantidad) + '</td>' +
                    '<td class="d-none d-md-table-cell align-middle">' + (producto.unidad || 'N/A') + '</td>' +
                    '<td class="text-end d-none d-md-table-cell align-middle">$' + fmtNum(precio) + '</td>' +
                    '<td class="text-end align-middle">$' + fmtNum(subtotal) + '</td>' +
                    '</tr>');
            });
            $('#detallesTotal').text('$' + fmtNum(totalGeneral));
            var modal = getDetallesModal();
            if (modal) modal.show();
        },
        error: function () {
            mostrarAlerta('Error al cargar los detalles de la factura', 'error');
        }
    });
}

function imprimirFactura() {
    var frame = document.getElementById('facturaFrame');
    if (frame && frame.contentWindow) frame.contentWindow.print();
}

document.querySelectorAll('.ventasTablaBody').forEach(tbody => {
    tbody.addEventListener('click', function (e) {
        var btnDet = e.target.closest('.btn-detalles');
        var btnReim = e.target.closest('.btn-reimprimir');
        if (btnDet) {
            var id = btnDet.getAttribute('data-factura-id');
            if (id) mostrarDetalles(id);
        }
        if (btnReim) {
            var id = btnReim.getAttribute('data-factura-id');
            var numero = btnReim.getAttribute('data-factura-numero');
            if (id) mostrarFactura(id, numero != null && numero !== '' ? numero : undefined);
        }
    });
});

document.getElementById('filtrarVentas').addEventListener('click', function () {
    const desde = document.getElementById('fechaDesde').value;
    const hasta = document.getElementById('fechaHasta').value;
    const q = document.getElementById('buscarVentas').value || '';
    if (!desde || !hasta) {
        mostrarAlerta('Por favor seleccione ambas fechas', 'warning');
        return;
    }
    const params = new URLSearchParams({ desde, hasta, q });
    const eventoId = new URLSearchParams(window.location.search).get('evento_id');
    if (eventoId) params.set('evento_id', eventoId);
    window.location.href = `/ventas?${params.toString()}`;
});

document.getElementById('limpiarFiltrosVentas').addEventListener('click', function () {
    const params = new URLSearchParams(window.location.search);
    params.delete('desde');
    params.delete('hasta');
    params.delete('q');
    window.location.href = (params.toString() ? '/ventas?' + params.toString() : '/ventas');
});

const btnExportar = document.getElementById('exportarVentas');
if (btnExportar) {
    btnExportar.addEventListener('click', function () {
        const desde = document.getElementById('fechaDesde').value;
        const hasta = document.getElementById('fechaHasta').value;
        const q = document.getElementById('buscarVentas').value || '';
        const params = new URLSearchParams();
        if (desde && hasta) { params.set('desde', desde); params.set('hasta', hasta); }
        if (q) params.set('q', q);
        const eventoId = new URLSearchParams(window.location.search).get('evento_id');
        if (eventoId) params.set('evento_id', eventoId);
        window.open(`/ventas/export?${params.toString()}`, '_blank');
    });
}

(function initFiltrosDesdeURL() {
    const p = new URLSearchParams(window.location.search);
    const desde = p.get('desde');
    const hasta = p.get('hasta');
    const q = p.get('q') || '';
    if (desde) document.getElementById('fechaDesde').value = desde;
    if (hasta) document.getElementById('fechaHasta').value = hasta;
    if (q) document.getElementById('buscarVentas').value = q;
    if (!desde || !hasta) {
        const hoy = new Date();
        const hace30Dias = new Date();
        hace30Dias.setDate(hace30Dias.getDate() - 30);
        document.getElementById('fechaDesde').value = document.getElementById('fechaDesde').value || hace30Dias.toISOString().split('T')[0];
        document.getElementById('fechaHasta').value = document.getElementById('fechaHasta').value || hoy.toISOString().split('T')[0];
    }
})();

var optsColombia = { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'medium' };
document.querySelectorAll('.fecha-cell[data-fecha-iso]').forEach(function (cell) {
    var iso = cell.getAttribute('data-fecha-iso');
    var span = cell.querySelector('.fecha-venta-local');
    if (iso && span) {
        try {
            var d = new Date(iso);
            if (!isNaN(d.getTime())) span.textContent = d.toLocaleString('es-CO', optsColombia);
        } catch (e) { }
    }
});

const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));

function fmtMoneda(n) { return (Number(n) || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function calcularTotales() {
    let totalNeto = 0, tefNeto = 0, ttrNeto = 0;
    document.querySelectorAll('.venta-row').forEach(tr => {
        const totalEl = tr.querySelector('.total-cell');
        if (!totalEl) return;

        const neto = Number(totalEl.dataset.neto || 0);
        const formaEl = tr.querySelector('.forma-pago-cell');
        const forma = formaEl ? formaEl.innerText.trim().toLowerCase() : '';

        totalNeto += neto;

        if (forma === 'efectivo') tefNeto += neto;
        else if (forma === 'transferencia') ttrNeto += neto;
    });

    const elNeto = document.getElementById('totalGeneral');
    const elEfectivo = document.getElementById('totalEfectivo');
    const elTransf = document.getElementById('totalTransferencia');

    if (elNeto) elNeto.textContent = '$' + fmtMoneda(totalNeto);
    if (elEfectivo) elEfectivo.textContent = '$' + fmtMoneda(tefNeto);
    if (elTransf) elTransf.textContent = '$' + fmtMoneda(ttrNeto);

    var resE = document.getElementById('totalEfectivoResumen');
    var resT = document.getElementById('totalTransferenciaResumen');
    var resG = document.getElementById('totalGeneralResumen');

    if (resE) resE.textContent = '$' + fmtMoneda(tefNeto);
    if (resT) resT.textContent = '$' + fmtMoneda(ttrNeto);
    if (resG) resG.textContent = '$' + fmtMoneda(totalNeto);
}

calcularTotales();
