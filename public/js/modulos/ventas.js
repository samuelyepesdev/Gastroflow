function getFacturaModal() {
    const el = document.getElementById('facturaModal');
    return el ? bootstrap.Modal.getOrCreateInstance(el) : null;
}
function getDetallesModal() {
    const el = document.getElementById('detallesModal');
    return el ? bootstrap.Modal.getOrCreateInstance(el) : null;
}

function mostrarAlerta(mensaje, tipo) {
    tipo = tipo || 'success';
    const alertaDiv = document.createElement('div');
    alertaDiv.className = 'custom-alert ' + tipo;
    alertaDiv.innerHTML = '<div class="alert-content"><i class="bi ' + (tipo === 'success' ? 'bi-check-circle' : tipo === 'error' ? 'bi-x-circle' : 'bi-exclamation-triangle') + ' me-2"></i>' + mensaje + '</div><button type="button" class="btn-close ms-3" onclick="this.parentElement.remove()"></button>';
    document.body.appendChild(alertaDiv);
    setTimeout(function () { alertaDiv.remove(); }, 5000);
}

function mostrarFactura(id, numeroDisplay) {
    const modalEl = document.getElementById('facturaModal');
    const frameEl = document.getElementById('facturaFrame');
    const titleEl = modalEl && modalEl.querySelector('.modal-title');
    if (!modalEl || !frameEl) return;
    if (titleEl) titleEl.textContent = 'Factura #' + (numeroDisplay != null ? numeroDisplay : id);
    frameEl.src = '/api/facturas/' + id + '/imprimir?return=' + encodeURIComponent('/ventas');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
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
            const cliente = data.cliente || {};
            const factura = data.factura || {};
            $('#detallesCliente').html('<p><strong>Nombre:</strong> ' + (cliente.nombre || '-') + '</p><p><strong>Dirección:</strong> ' + (cliente.direccion || 'No especificada') + '</p><p><strong>Teléfono:</strong> ' + (cliente.telefono || 'No especificado') + '</p>');
            let facturaHtml = '<p><strong>Factura #:</strong> ' + (factura.numero != null ? factura.numero : factura.id) + '</p><p><strong>Fecha:</strong> ' + ((factura.fechaISO || factura.fecha) ? new Date(factura.fechaISO || factura.fecha).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'medium' }) : '-') + '</p><p><strong>Forma de Pago:</strong> ' + (factura.forma_pago ? (factura.forma_pago.charAt(0).toUpperCase() + factura.forma_pago.slice(1)) : '-') + '</p>';
            if (factura.propina != null && Number(factura.propina) > 0) {
                facturaHtml += '<p><strong>Propina:</strong> $' + (Number(factura.propina) || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</p>';
            }
            $('#detallesFactura').html(facturaHtml);
            const tbody = $('#detallesProductos');
            tbody.empty();
            let totalGeneral = 0;
            const productos = data.productos || [];
            const fmtNum = function (n) { return (Number(n) || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
            productos.forEach(function (producto) {
                const cantidad = Number(producto.cantidad) || 0;
                const precio = Number(producto.precio) || 0;
                const subtotal = Number(producto.subtotal) || 0;
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
            const modal = getDetallesModal();
            if (modal) modal.show();
        },
        error: function () {
            mostrarAlerta('Error al cargar los detalles de la factura', 'error');
        }
    });
}

function imprimirFactura() {
    const frame = document.getElementById('facturaFrame');
    if (frame && frame.contentWindow) frame.contentWindow.print();
}

// Global delegated click handler for details & printing inside the grouped table
const tableBody = document.getElementById('ventasTablaGrouped');
if (tableBody) {
    tableBody.addEventListener('click', function (e) {
        const btnDet = e.target.closest('.btn-detalles');
        const btnReim = e.target.closest('.btn-reimprimir');
        if (btnDet) {
            const id = btnDet.dataset.facturaId;
            if (id) mostrarDetalles(id);
        }
        if (btnReim) {
            const id = btnReim.dataset.facturaId;
            const numero = btnReim.dataset.facturaNumero;
            if (id) mostrarFactura(id, numero != null && numero !== '' ? numero : undefined);
        }
    });
}

// Server date range filter trigger
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

// Clean filter parameters
document.getElementById('limpiarFiltrosVentas').addEventListener('click', function () {
    const params = new URLSearchParams(window.location.search);
    params.delete('desde');
    params.delete('hasta');
    params.delete('q');
    window.location.href = (params.toString() ? '/ventas?' + params.toString() : '/ventas');
});

// Excel download click trigger
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

// Local live filters logic
function rowMatchesSearch(row) {
    const q = (document.getElementById('buscarVentas').value || '').trim().toLowerCase();
    if (!q) return true;
    
    const invoiceId = row.querySelector('.factura-id')?.textContent.toLowerCase() || '';
    const clientName = row.cells[2]?.textContent.toLowerCase() || '';
    
    return invoiceId.includes(q) || clientName.includes(q);
}

function recalculateVisibleStats() {
    let visibleEfectivo = 0;
    let visibleTransferencia = 0;
    let visibleTotal = 0;
    let visibleCount = 0;
    
    const groupHeaders = document.querySelectorAll('.table-group-header');
    groupHeaders.forEach(header => {
        let next = header.nextElementSibling;
        let groupTotal = 0;
        let groupCount = 0;
        
        while (next && !next.classList.contains('table-group-header')) {
            if (next.style.display !== 'none') {
                const total = Number(next.dataset.total || 0);
                const fp = next.dataset.formaPago || '';
                
                groupTotal += total;
                groupCount++;
                
                visibleTotal += total;
                visibleCount++;
                if (fp === 'efectivo') {
                    visibleEfectivo += total;
                } else {
                    visibleTransferencia += total;
                }
            }
            next = next.nextElementSibling;
        }
        
        const summarySpan = header.querySelector('.group-summary');
        if (summarySpan) {
            summarySpan.innerHTML = groupCount + ' facturas · <b>$ ' + Math.round(groupTotal).toLocaleString('es-CO') + '</b>';
        }
        
        if (groupCount === 0) {
            header.style.setProperty('display', 'none', 'important');
        } else {
            header.style.setProperty('display', 'table-row', 'important');
        }
    });
    
    const fmt = (n) => '$ ' + Math.round(n).toLocaleString('es-CO');
    
    const elEfectivo = document.getElementById('totalEfectivoVal');
    if (elEfectivo) elEfectivo.textContent = fmt(visibleEfectivo);
    
    const elTransf = document.getElementById('totalTransferenciaVal');
    if (elTransf) elTransf.textContent = fmt(visibleTransferencia);
    
    const elTotal = document.getElementById('totalGeneralVal');
    if (elTotal) elTotal.textContent = fmt(visibleTotal);
    
    const elCount = document.getElementById('facturasHoyVal');
    if (elCount) {
        let hoyCount = 0;
        document.querySelectorAll('.venta-row').forEach(row => {
            if (row.style.display !== 'none') {
                let prev = row.previousElementSibling;
                while (prev && !prev.classList.contains('table-group-header')) {
                    prev = prev.previousElementSibling;
                }
                if (prev && prev.classList.contains('today')) {
                    hoyCount++;
                }
            }
        });
        elCount.textContent = hoyCount;
    }
}

// Payment method segment click handler
$(document).on('click', '.payment-segment-btn', function() {
    $('.payment-segment-btn').removeClass('active');
    $(this).addClass('active');
    
    const selectedPay = $(this).data('pay');
    
    document.querySelectorAll('.venta-row').forEach(row => {
        const rowPay = row.dataset.formaPago;
        const matchesSearch = rowMatchesSearch(row);
        const matchesPay = (selectedPay === 'todos' || rowPay === selectedPay);
        
        if (matchesSearch && matchesPay) {
            row.style.setProperty('display', 'table-row', 'important');
        } else {
            row.style.setProperty('display', 'none', 'important');
        }
    });
    
    recalculateVisibleStats();
});

// Search input key press local trigger
const searchInput = document.getElementById('buscarVentas');
if (searchInput) {
    searchInput.addEventListener('input', function() {
        const selectedPay = document.querySelector('.payment-segment-btn.active')?.dataset.pay || 'todos';
        
        document.querySelectorAll('.venta-row').forEach(row => {
            const rowPay = row.dataset.formaPago;
            const matchesSearch = rowMatchesSearch(row);
            const matchesPay = (selectedPay === 'todos' || rowPay === selectedPay);
            
            if (matchesSearch && matchesPay) {
                row.style.setProperty('display', 'table-row', 'important');
            } else {
                row.style.setProperty('display', 'none', 'important');
            }
        });
        
        recalculateVisibleStats();
    });
}

// Initialize filters from query params
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

// Bootstrap Tooltips initialization
const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));
