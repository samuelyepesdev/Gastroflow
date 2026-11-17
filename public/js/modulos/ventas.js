function getFacturaModal() {
    const el = document.getElementById('facturaModal');
    return el ? bootstrap.Modal.getOrCreateInstance(el) : null;
}
function getDetallesModal() {
    const el = document.getElementById('detallesModal');
    return el ? bootstrap.Modal.getOrCreateInstance(el) : null;
}


function mostrarFactura(id, numeroDisplay) {
    const modalEl = document.getElementById('facturaModal');
    const frameEl = document.getElementById('facturaFrame');
    const titleEl = modalEl?.querySelector('.modal-title');
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
                GF.toast('No se encontraron detalles de la factura', 'error');
                return;
            }
            const cliente = data.cliente || {};
            const factura = data.factura || {};
            const abonos = data.abonos || [];
            const bonosRedimidos = data.bonos_redimidos || [];
            const pagosPorProducto = data.pagos_por_producto || [];
            const fmtNum = function (n) { return (Number(n) || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
            const fmtFecha = function (f) { return f ? new Date(f).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'medium' }) : '-'; };
            $('#detallesCliente').html('<p><strong>Nombre:</strong> ' + GF.escapeHtml(cliente.nombre || '-') + '</p><p><strong>Dirección:</strong> ' + GF.escapeHtml(cliente.direccion || 'No especificada') + '</p><p><strong>Teléfono:</strong> ' + GF.escapeHtml(cliente.telefono || 'No especificado') + '</p>');
            let facturaHtml = '<p><strong>Factura #:</strong> ' + (factura.numero != null ? factura.numero : factura.id) + '</p><p><strong>Fecha:</strong> ' + fmtFecha(factura.fechaISO || factura.fecha) + '</p><p><strong>Forma de Pago:</strong> ' + (factura.forma_pago ? (factura.forma_pago.charAt(0).toUpperCase() + factura.forma_pago.slice(1)) : '-');
            const montoEfectivo = Number(factura.monto_efectivo) || 0;
            const montoTransferencia = Number(factura.monto_transferencia) || 0;
            const montoBono = Number(factura.monto_bono) || 0;
            if (factura.forma_pago === 'mixto') {
                const partes = [];
                if (montoEfectivo > 0) partes.push('Efectivo: ' + GF.dinero(montoEfectivo));
                if (montoTransferencia > 0) partes.push('Transferencia: ' + GF.dinero(montoTransferencia));
                if (montoBono > 0) partes.push('Bono: ' + GF.dinero(montoBono));
                facturaHtml += ' <span class="text-muted">(' + partes.join(' · ') + ')</span>';
            }
            facturaHtml += '</p>';
            if (factura.propina != null && Number(factura.propina) > 0) {
                facturaHtml += '<p><strong>Propina:</strong> ' + GF.dinero(factura.propina) + '</p>';
            }
            $('#detallesFactura').html(facturaHtml);

            // Auditoría de pagos: abonos libres (pedido_abonos) + pagos por producto
            // (pedido_item_pagos, "Facturar por Producto") + bonos redimidos
            // (bono_movimientos) + lo que faltó al momento de facturar (la
            // diferencia entre lo ya cubierto por los anteriores y el total por
            // cada método). Solo se muestra si hubo al menos un movimiento -- una
            // factura pagada de una sola vez no necesita esta sección.
            if (abonos.length > 0 || bonosRedimidos.length > 0 || pagosPorProducto.length > 0) {
                const sumaCubierta = { efectivo: 0, transferencia: 0 };
                const filasAbono = abonos.map(function (a) {
                    sumaCubierta[a.forma_pago] = (sumaCubierta[a.forma_pago] || 0) + Number(a.monto || 0);
                    const metodo = a.forma_pago === 'efectivo' ? 'Efectivo' : 'Transferencia';
                    return '<tr><td><i class="bi bi-piggy-bank me-1 text-success"></i>Abono ' + metodo + (a.usuario_nombre ? ' · ' + GF.escapeHtml(a.usuario_nombre) : '') + '</td>' +
                        '<td class="text-muted small">' + fmtFecha(a.created_at) + '</td>' +
                        '<td class="text-end">' + GF.dinero(a.monto) + '</td></tr>';
                });
                const filasProducto = pagosPorProducto.map(function (p) {
                    sumaCubierta[p.forma_pago] = (sumaCubierta[p.forma_pago] || 0) + Number(p.monto || 0);
                    const metodo = p.forma_pago === 'efectivo' ? 'Efectivo' : 'Transferencia';
                    return '<tr><td><i class="bi bi-cart-check me-1 text-info"></i>Pagado por producto: ' + GF.escapeHtml(p.producto_nombre) + ' x' + fmtNum(p.cantidad) + ' (' + metodo + ')' + (p.usuario_nombre ? ' · ' + GF.escapeHtml(p.usuario_nombre) : '') + '</td>' +
                        '<td class="text-muted small">' + fmtFecha(p.created_at) + '</td>' +
                        '<td class="text-end">' + GF.dinero(p.monto) + '</td></tr>';
                });
                const filasBono = bonosRedimidos.map(function (b) {
                    return '<tr><td><i class="bi bi-gift me-1 text-warning"></i>Bono ' + GF.escapeHtml(b.codigo) + ' redimido' + (b.usuario_nombre ? ' · ' + GF.escapeHtml(b.usuario_nombre) : '') + '</td>' +
                        '<td class="text-muted small">' + fmtFecha(b.created_at) + '</td>' +
                        '<td class="text-end">' + GF.dinero(b.monto) + '</td></tr>';
                });
                // Orden cronológico: los pagos por producto suelen pasar antes que los
                // abonos libres, pero mezclarlos por fecha real evita adivinar.
                let filasPagos = filasAbono.concat(filasProducto, filasBono)
                    .join('');

                // Si un superadmin corrigió el desglose de la venta, los abonos originales pueden
                // ya no cuadrar con el pago final: se avisa y se muestra el desglose vigente.
                const corregida = sumaCubierta.efectivo > montoEfectivo + 0.01 || sumaCubierta.transferencia > montoTransferencia + 0.01;
                const restoEfectivo = Math.max(0, montoEfectivo - sumaCubierta.efectivo);
                const restoTransferencia = Math.max(0, montoTransferencia - sumaCubierta.transferencia);
                if (corregida) {
                    filasPagos = filasPagos.replace(/<tr>/g, '<tr class="text-muted fila-original">');
                    if (montoEfectivo > 0) {
                        filasPagos += '<tr class="table-light fw-semibold"><td><i class="bi bi-check2-circle me-1 text-success"></i>Pago final registrado (Efectivo)</td><td></td><td class="text-end">' + GF.dinero(montoEfectivo) + '</td></tr>';
                    }
                    if (montoTransferencia > 0) {
                        filasPagos += '<tr class="table-light fw-semibold"><td><i class="bi bi-check2-circle me-1 text-success"></i>Pago final registrado (Transferencia)</td><td></td><td class="text-end">' + GF.dinero(montoTransferencia) + '</td></tr>';
                    }
                } else if (restoEfectivo > 0) {
                    filasPagos += '<tr><td><i class="bi bi-cash-stack me-1 text-primary"></i>Pago restante al facturar (Efectivo)</td><td class="text-muted small">' + fmtFecha(factura.fechaISO || factura.fecha) + '</td><td class="text-end">' + GF.dinero(restoEfectivo) + '</td></tr>';
                }
                if (!corregida && restoTransferencia > 0) {
                    filasPagos += '<tr><td><i class="bi bi-bank me-1 text-primary"></i>Pago restante al facturar (Transferencia)</td><td class="text-muted small">' + fmtFecha(factura.fechaISO || factura.fecha) + '</td><td class="text-end">' + GF.dinero(restoTransferencia) + '</td></tr>';
                }

                $('#detallesPagos').html(
                    '<h6>Historial de pagos</h6>' +
                    (corregida ? '<div class="alert alert-warning py-2 small mb-2"><i class="bi bi-exclamation-triangle me-1"></i>Esta venta fue corregida por un administrador. Los abonos en gris son los registros originales y ya no cuadran con el pago final, que es el que cuenta en caja y finanzas.</div>' : '') +
                    '<div class="table-responsive"><table class="table table-sm mb-0"><tbody>' + filasPagos + '</tbody></table></div>'
                );
            } else {
                $('#detallesPagos').empty();
            }

            const tbody = $('#detallesProductos');
            tbody.empty();
            let totalGeneral = 0;
            const productos = data.productos || [];
            productos.forEach(function (producto) {
                const cantidad = Number(producto.cantidad) || 0;
                const precio = Number(producto.precio) || 0;
                const subtotal = Number(producto.subtotal) || 0;
                totalGeneral += subtotal;
                const serviceBadge = producto.es_servicio ? ' <span class="badge bg-info text-dark" style="font-size: 0.6rem;">Servicio</span>' : '';
                tbody.append('<tr>' +
                    '<td><div class="fw-medium">' + GF.escapeHtml(producto.nombre || '') + serviceBadge + '</div>' +
                    '<div class="d-block d-md-none small text-muted">A ' + GF.dinero(precio) + ' / ' + GF.escapeHtml(producto.unidad || 'N/A') + '</div></td>' +
                    '<td class="text-end align-middle">' + fmtNum(cantidad) + '</td>' +
                    '<td class="d-none d-md-table-cell align-middle">' + (producto.unidad || 'N/A') + '</td>' +
                    '<td class="text-end d-none d-md-table-cell align-middle">' + GF.dinero(precio) + '</td>' +
                    '<td class="text-end align-middle">' + GF.dinero(subtotal) + '</td>' +
                    '</tr>');
            });
            $('#detallesTotal').text(GF.dinero(totalGeneral));
            const modal = getDetallesModal();
            if (modal) modal.show();
        },
        error: function () {
            GF.toast('Error al cargar los detalles de la factura', 'error');
        }
    });
}

function imprimirFactura() {
    const frame = document.getElementById('facturaFrame');
    frame?.contentWindow?.print();
}

// Global delegated click handler for details & printing inside the grouped table
const tableBody = document.getElementById('ventasTablaGrouped');
if (tableBody) {
    tableBody.addEventListener('click', function (e) {
        const btnDet = e.target.closest('.btn-detalles');
        const btnReim = e.target.closest('.btn-reimprimir');
        const btnEditar = e.target.closest('.btn-editar-cliente');
        if (btnEditar) {
            abrirEditarCliente(btnEditar);
        }
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

// ── Corregir cliente de una factura normal (permiso facturas.editar) ──
const editarCliente = { facturaId: null, clienteId: null, timer: null, pendiente: 0 };

function elEditar(id) {
    return document.getElementById(id);
}

function limpiarSeleccionCliente() {
    editarCliente.clienteId = null;
    elEditar('editarClienteGuardar').disabled = true;
}

function abrirEditarCliente(btn) {
    const modalEl = elEditar('editarClienteModal');
    if (!modalEl) return;
    editarCliente.facturaId = btn.dataset.facturaId;
    limpiarSeleccionCliente();
    elEditar('editarClienteNumero').textContent = '#' + btn.dataset.facturaNumero;
    elEditar('editarClienteActual').textContent = btn.dataset.clienteNombre || 'Consumidor final';
    elEditar('editarClienteBuscar').value = '';
    elEditar('editarClienteResultados').innerHTML = '';
    cargarPagoEditable(btn.dataset.facturaId);
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

// Forma de pago: el servidor dice si se puede corregir (factura normal y turno de caja abierto).
async function cargarPagoEditable(facturaId) {
    const aviso = elEditar('editarPagoAviso');
    const campos = elEditar('editarPagoCampos');
    campos.classList.add('d-none');
    aviso.classList.remove('d-none');
    aviso.textContent = 'Cargando…';
    try {
        const d = await GF.api.get('/facturas/' + facturaId + '/editable', 'No se pudo cargar la factura');
        editarCliente.pendiente = Number(d.pendiente_en_dinero) || 0;
        if (!d.pago_editable) {
            aviso.textContent = d.pago_motivo || 'La forma de pago no se puede corregir';
            return;
        }
        aviso.classList.add('d-none');
        campos.classList.remove('d-none');
        elEditar('editarPagoPendiente').textContent = GF.dinero(editarCliente.pendiente);
        elEditar('editarPagoBono').textContent = Number(d.monto_bono) > 0 ? '(más ' + GF.dinero(d.monto_bono) + ' con bono, que no cambia)' : '';
        elEditar('editarPagoForma').value = ['efectivo', 'transferencia', 'mixto'].includes(d.forma_pago) ? d.forma_pago : 'mixto';
        elEditar('editarPagoEfectivo').value = d.monto_efectivo || '';
        elEditar('editarPagoTransferencia').value = d.monto_transferencia || '';
        actualizarPagoMixto();
    } catch (err) {
        aviso.textContent = err.message;
    }
}

function actualizarPagoMixto() {
    elEditar('editarPagoMixto').classList.toggle('d-none', elEditar('editarPagoForma').value !== 'mixto');
}

// En mixto, al escribir un monto el otro se completa para sumar lo que se cobró en dinero.
function completarMontoMixto(origen, destino) {
    const valor = Math.min(Math.max(Number(elEditar(origen).value) || 0, 0), editarCliente.pendiente);
    elEditar(destino).value = Math.round((editarCliente.pendiente - valor) * 100) / 100;
}

async function buscarClientesParaEditar(q) {
    const cont = elEditar('editarClienteResultados');
    if (!q || q.trim().length < 2) {
        cont.innerHTML = '';
        return;
    }
    const clientes = await GF.api.getOr('/clientes/buscar?q=' + encodeURIComponent(q.trim()), []);
    cont.innerHTML = (clientes || []).length === 0
        ? '<div class="list-group-item text-muted small">Sin resultados</div>'
        : clientes.map(function (c) {
            return '<button type="button" class="list-group-item list-group-item-action" data-cliente-id="' + Number(c.id) + '">' +
                GF.escapeHtml(c.nombre || '') +
                (c.telefono ? ' <span class="text-muted small">· ' + GF.escapeHtml(c.telefono) + '</span>' : '') +
                '</button>';
        }).join('');
}

if (elEditar('editarClienteModal')) {
    elEditar('editarClienteBuscar').addEventListener('input', function (e) {
        limpiarSeleccionCliente();
        clearTimeout(editarCliente.timer);
        editarCliente.timer = setTimeout(function () { buscarClientesParaEditar(e.target.value); }, 300);
    });

    elEditar('editarClienteResultados').addEventListener('click', function (e) {
        const item = e.target.closest('[data-cliente-id]');
        if (!item) return;
        editarCliente.clienteId = item.dataset.clienteId;
        elEditar('editarClienteResultados').querySelectorAll('.active').forEach(function (n) { n.classList.remove('active'); });
        item.classList.add('active');
        elEditar('editarClienteGuardar').disabled = false;
    });

    elEditar('editarPagoForma').addEventListener('change', actualizarPagoMixto);
    elEditar('editarPagoEfectivo').addEventListener('input', function () { completarMontoMixto('editarPagoEfectivo', 'editarPagoTransferencia'); });
    elEditar('editarPagoTransferencia').addEventListener('input', function () { completarMontoMixto('editarPagoTransferencia', 'editarPagoEfectivo'); });

    elEditar('editarPagoGuardar').addEventListener('click', async function () {
        if (!editarCliente.facturaId) return;
        const btn = this;
        const forma = elEditar('editarPagoForma').value;
        const cuerpo = { forma_pago: forma };
        if (forma === 'mixto') {
            cuerpo.monto_efectivo = Number(elEditar('editarPagoEfectivo').value) || 0;
            cuerpo.monto_transferencia = Number(elEditar('editarPagoTransferencia').value) || 0;
        }
        GF.cargando(btn, true);
        try {
            await GF.api.put('/facturas/' + editarCliente.facturaId + '/pago', cuerpo, 'No se pudo corregir la forma de pago');
            GF.toast('Forma de pago actualizada', 'success');
            window.location.reload();
        } catch (err) {
            GF.toast(err.message, 'error');
            GF.cargando(btn, false);
        }
    });

    elEditar('editarClienteGuardar').addEventListener('click', async function () {
        if (!editarCliente.facturaId || !editarCliente.clienteId) return;
        const btn = this;
        GF.cargando(btn, true);
        try {
            await GF.api.put('/facturas/' + editarCliente.facturaId + '/cliente', { cliente_id: Number(editarCliente.clienteId) }, 'No se pudo corregir el cliente');
            GF.toast('Cliente de la factura actualizado', 'success');
            window.location.reload();
        } catch (err) {
            GF.toast(err.message, 'error');
            GF.cargando(btn, false);
        }
    });
}

// Server date range filter trigger
document.getElementById('filtrarVentas').addEventListener('click', function () {
    const desde = document.getElementById('fechaDesde').value;
    const hasta = document.getElementById('fechaHasta').value;
    const q = document.getElementById('buscarVentas').value || '';
    if (!desde || !hasta) {
        GF.toast('Por favor seleccione ambas fechas', 'warning');
        return;
    }
    const params = new URLSearchParams({ desde, hasta, q });
    const pago = pagoSeleccionado();
    if (pago !== 'todos') params.set('pago', pago);
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
    params.delete('pago');
    params.delete('page');
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

// Los filtros (búsqueda y forma de pago) los aplica el servidor para poder paginar:
// cada cambio recarga la lista desde la página 1 conservando el resto de filtros.
function pagoSeleccionado() {
    return document.querySelector('.payment-segment-btn.active')?.dataset.pay || 'todos';
}

function aplicarFiltrosEnServidor(pago) {
    const params = new URLSearchParams(window.location.search);
    params.delete('page');
    const q = (document.getElementById('buscarVentas').value || '').trim();
    if (q) params.set('q', q); else params.delete('q');
    if (pago && pago !== 'todos') params.set('pago', pago); else params.delete('pago');
    window.location.href = '/ventas' + (params.toString() ? '?' + params.toString() : '');
}

$(document).on('click', '.payment-segment-btn', function () {
    aplicarFiltrosEnServidor($(this).data('pay'));
});

// Búsqueda: se envía al dejar de escribir (o con Enter).
const searchInput = document.getElementById('buscarVentas');
if (searchInput) {
    let debounceBusqueda = null;
    searchInput.addEventListener('input', function () {
        clearTimeout(debounceBusqueda);
        debounceBusqueda = setTimeout(function () { aplicarFiltrosEnServidor(pagoSeleccionado()); }, 500);
    });
    searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            clearTimeout(debounceBusqueda);
            aplicarFiltrosEnServidor(pagoSeleccionado());
        }
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
