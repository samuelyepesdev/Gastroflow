const base = '/inventario';
let modoCompraRapida = false;
let colaInsumosCompra = [];

function abrirEntrada(id, nombre) { document.getElementById('entradaInsumoId').value = id; document.getElementById('entradaInsumoNombre').textContent = nombre; document.getElementById('entradaCantidad').value = ''; document.getElementById('entradaCosto').value = ''; document.getElementById('entradaRef').value = ''; new bootstrap.Modal(document.getElementById('modalEntrada')).show(); }
function abrirSalida(id, nombre, disp) { document.getElementById('salidaInsumoId').value = id; document.getElementById('salidaInsumoNombre').textContent = nombre; document.getElementById('salidaDisponible').textContent = disp; document.getElementById('salidaCantidad').value = ''; document.getElementById('salidaRef').value = ''; new bootstrap.Modal(document.getElementById('modalSalida')).show(); }
function abrirAjuste(id, nombre, disp) {
    document.getElementById('ajusteInsumoId').value = id;
    document.getElementById('ajusteInsumoNombre').textContent = nombre;
    document.getElementById('ajusteDisponible').textContent = disp;
    document.getElementById('ajusteCantidad').value = '';
    document.getElementById('ajusteRef').value = 'Ajuste manual';
    document.getElementById('adjSuma').checked = true;
    new bootstrap.Modal(document.getElementById('modalAjuste')).show();
}

async function verMovimientos(id, nombre) {
    document.getElementById('movInsumoNombre').textContent = nombre;
    const tbody = document.getElementById('tbodyMovimientos');
    const loading = document.getElementById('movimientosCargando');
    tbody.innerHTML = '';
    loading.style.display = 'block';
    new bootstrap.Modal(document.getElementById('modalMovimientos')).show();

    try {
        const r = await fetch(base + '/api/movimientos?insumo_id=' + id);
        const movs = await r.json();
        tbody.innerHTML = '';
        if (!movs || movs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-3">No hay movimientos registrados.</td></tr>';
        } else {
            movs.forEach(m => {
                const row = document.createElement('tr');
                const color = m.tipo === 'entrada' ? 'text-success' : (m.tipo === 'salida' ? 'text-danger' : 'text-primary');
                const signo = m.tipo === 'entrada' ? '+' : (m.tipo === 'salida' ? '-' : '');
                row.innerHTML = `
                    <td class="ps-3 small">${new Date(m.created_at).toLocaleString()}</td>
                    <td><span class="badge ${m.tipo === 'entrada' ? 'bg-success' : (m.tipo === 'salida' ? 'bg-danger' : 'bg-primary')}">${m.tipo.toUpperCase()}</span></td>
                    <td class="text-end fw-bold ${color}">${signo}${parseFloat(m.cantidad).toLocaleString('es-CO')}</td>
                    <td class="small">${m.documento_referencia || m.referencia || '-'}</td>
                    <td class="small">${m.proveedor_nombre || '-'}</td>
                `;
                tbody.appendChild(row);
            });
        }
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger py-3">Error al cargar historial.</td></tr>';
    } finally {
        loading.style.display = 'none';
    }
}

document.getElementById('btnCrearInsumo').addEventListener('click', async () => {
    const fCodigo = document.getElementById('nuevoCodigo');
    const fNombre = document.getElementById('nuevoNombre');
    const selectMedida = document.getElementById('nuevoUnidadMedidaId');
    const textMedida = document.getElementById('nuevoUnidadCompraText');

    const payload = {
        codigo: fCodigo.value.trim(),
        nombre: fNombre.value.trim(),
        unidad_compra: selectMedida.value ? selectMedida.options[selectMedida.selectedIndex].dataset.name || textMedida.value : textMedida.value || 'UND',
        unidad_medida_id: selectMedida.value || null,
        categoria_id: document.getElementById('nuevoCategoriaId').value || null,
        unidad_base: document.getElementById('nuevoUnidadBase').value,
        cantidad_compra: parseFloat(document.getElementById('nuevoCantidadCompra').value) || 1,
        precio_compra: parseFloat(document.getElementById('nuevoPrecioCompra').value) || 0,
        rendimiento_pct: parseFloat(document.getElementById('nuevoRendimiento').value) || 100,
        stock_minimo: parseFloat(document.getElementById('nuevoStockMinimo').value) || 0,
        stock_inicial: parseFloat(document.getElementById('nuevoStockInicial').value) || 0,
        proveedor_id: document.getElementById('nuevoProveedorId').value || null,
        precio_venta: parseFloat(document.getElementById('nuevoPrecioVenta').value) || 0
    };
    let valid = true;
    [fCodigo, fNombre].forEach(f => {
        if (!f.value.trim()) { f.classList.add('is-invalid'); valid = false; }
        else f.classList.remove('is-invalid');
    });
    if (!valid) return;
    const btn = document.getElementById('btnCrearInsumo');
    setLoading(btn, true);
    try {
        const r = await fetch(base + '/api/insumos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), credentials: 'same-origin' });
        if (r.ok) {
            bootstrap.Modal.getOrCreateInstance(document.getElementById('modalNuevoInsumo')).hide();
            await Swal.fire({ icon: 'success', title: 'Insumo creado', timer: 1200, showConfirmButton: false });
            location.reload();
        } else {
            const e = await r.json();
            Swal.fire({ icon: 'error', title: 'Error', text: e.error || 'No se pudo crear el insumo' });
        }
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Error de conexión', text: err.message });
    } finally {
        setLoading(btn, false);
    }
});

document.getElementById('nuevoUnidadMedidaId')?.addEventListener('change', function () {
    const textMedida = document.getElementById('nuevoUnidadCompraText');
    if (this.value === "") {
        textMedida.classList.remove('d-none');
    } else {
        textMedida.classList.add('d-none');
    }
    actualizarPreviewCosto();
});

document.getElementById('nuevoCategoriaId')?.addEventListener('change', function () {
    const selectedText = this.options[this.selectedIndex].text.trim();
    const container = document.getElementById('containerPrecioVenta');
    if (selectedText === 'Cerámicas') {
        container.classList.remove('d-none');
    } else {
        container.classList.add('d-none');
        document.getElementById('nuevoPrecioVenta').value = '';
    }
});

function actualizarPreviewCosto() {
    const precio = parseFloat(document.getElementById('nuevoPrecioCompra')?.value) || 0;
    const cantidad = parseFloat(document.getElementById('nuevoCantidadCompra')?.value) || 1;
    const unidadBase = document.getElementById('nuevoUnidadBase')?.value || 'g';
    const preview = document.getElementById('previewCostoPorUnidad');
    const previewValor = document.getElementById('previewCosto');
    const previewUnidad = document.getElementById('previewUnidadBase');
    if (preview && previewValor) {
        previewUnidad.textContent = unidadBase;
        if (precio > 0 && cantidad > 0) {
            const costoPorUnidad = precio / cantidad;
            previewValor.textContent = '$' + costoPorUnidad.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
            preview.style.display = '';
        } else {
            preview.style.display = 'none';
        }
    }
}
document.getElementById('nuevoPrecioCompra')?.addEventListener('input', actualizarPreviewCosto);
document.getElementById('nuevoCantidadCompra')?.addEventListener('input', actualizarPreviewCosto);
document.getElementById('nuevoUnidadBase')?.addEventListener('change', actualizarPreviewCosto);

document.getElementById('btnConfirmarEntrada').addEventListener('click', async () => {
    const id = document.getElementById('entradaInsumoId').value;
    const cantidad = parseFloat(document.getElementById('entradaCantidad').value);
    const costo = document.getElementById('entradaCosto').value;
    const ref = document.getElementById('entradaRef').value;
    const fCant = document.getElementById('entradaCantidad');
    if (!cantidad || cantidad <= 0) {
        fCant.classList.add('is-invalid');
        Swal.fire({ icon: 'warning', title: 'Cantidad inválida', text: 'Ingresa una cantidad mayor a 0', timer: 1800, showConfirmButton: false });
        return;
    }
    fCant.classList.remove('is-invalid');
    const provId = document.getElementById('entradaProveedorId').value;
    const nFactura = document.getElementById('entradaFactura').value;
    const btn = document.getElementById('btnConfirmarEntrada');
    setLoading(btn, true);
    try {
        const r = await fetch(base + '/api/movimientos/entrada', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                insumo_id: id,
                cantidad,
                costo_unitario: costo ? parseFloat(costo) : null,
                referencia: ref || null,
                proveedor_id: provId || null,
                documento_referencia: nFactura || null
            }),
            credentials: 'same-origin'
        });
        if (r.ok) {
            bootstrap.Modal.getOrCreateInstance(document.getElementById('modalEntrada')).hide();

            if (modoCompraRapida && colaInsumosCompra.length > 0) {
                await Swal.fire({
                    icon: 'success',
                    title: 'Entrada registrada',
                    text: 'Cargando siguiente insumo...',
                    timer: 800,
                    showConfirmButton: false,
                    toast: true,
                    position: 'top-end'
                });
                procesarSiguienteInsumo();
            } else {
                await Swal.fire({ icon: 'success', title: 'Entrada registrada', timer: 1200, showConfirmButton: false });
                location.reload();
            }
        } else {
            const e = await r.json();
            Swal.fire({ icon: 'error', title: 'Error', text: e.error || 'No se pudo registrar' });
        }
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    } finally {
        setLoading(btn, false);
    }
});

function procesarSiguienteInsumo() {
    if (colaInsumosCompra.length === 0) {
        modoCompraRapida = false;
        Swal.fire({
            icon: 'success',
            title: '¡Proceso completado!',
            text: 'Se han procesado todos los insumos seleccionados.',
            confirmButtonText: 'Entendido'
        }).then(() => location.reload());
        return;
    }

    const insumo = colaInsumosCompra.shift();
    const stockActual = parseFloat(insumo.stock_actual) || 0;
    const stockMin = parseFloat(insumo.stock_minimo) || 0;
    const falta = Math.max(0, stockMin - stockActual);

    document.getElementById('entradaInsumoId').value = insumo.id || insumo.insumo_id;
    document.getElementById('entradaInsumoNombre').textContent = insumo.nombre;
    document.getElementById('entradaCantidad').value = falta > 0 ? falta : '';
    document.getElementById('entradaCosto').value = insumo.precio_compra || '';
    document.getElementById('entradaRef').value = 'Compra rápida - Lista mercado';
    document.getElementById('entradaProveedorId').value = insumo.proveedor_id || '';
    document.getElementById('entradaFactura').value = '';

    const modalEntrada = new bootstrap.Modal(document.getElementById('modalEntrada'));
    modalEntrada.show();
}

document.getElementById('btnConfirmarSalida').addEventListener('click', async () => {
    const id = document.getElementById('salidaInsumoId').value;
    const cantidad = parseFloat(document.getElementById('salidaCantidad').value);
    const ref = document.getElementById('salidaRef').value;
    const fCant = document.getElementById('salidaCantidad');
    if (!cantidad || cantidad <= 0) {
        fCant.classList.add('is-invalid');
        Swal.fire({ icon: 'warning', title: 'Cantidad inválida', text: 'Ingresa una cantidad mayor a 0', timer: 1800, showConfirmButton: false });
        return;
    }
    fCant.classList.remove('is-invalid');
    const btn = document.getElementById('btnConfirmarSalida');
    setLoading(btn, true);
    try {
        const r = await fetch(base + '/api/movimientos/salida', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ insumo_id: id, cantidad, referencia: ref || null }), credentials: 'same-origin' });
        if (r.ok) {
            bootstrap.Modal.getOrCreateInstance(document.getElementById('modalSalida')).hide();
            await Swal.fire({ icon: 'success', title: 'Salida registrada', timer: 1200, showConfirmButton: false });
            location.reload();
        } else {
            const e = await r.json();
            Swal.fire({ icon: 'error', title: 'Error', text: e.error || 'No se pudo registrar' });
        }
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    } finally {
        setLoading(btn, false);
    }
});

document.getElementById('btnConfirmarAjuste').addEventListener('click', async () => {
    const id = document.getElementById('ajusteInsumoId').value;
    let cantidad = parseFloat(document.getElementById('ajusteCantidad').value);
    const ref = document.getElementById('ajusteRef').value;
    const typo = document.querySelector('input[name="ajusteTipo"]:checked').value;
    const fCant = document.getElementById('ajusteCantidad');

    if (!cantidad || cantidad <= 0 || isNaN(cantidad)) {
        fCant.classList.add('is-invalid');
        Swal.fire({ icon: 'warning', title: 'Cantidad requerida', text: 'Ingresa un valor mayor a 0', timer: 2000, showConfirmButton: false });
        return;
    }

    if (typo === 'resta') {
        cantidad = cantidad * -1;
    }

    fCant.classList.remove('is-invalid');
    const btn = document.getElementById('btnConfirmarAjuste');
    setLoading(btn, true);
    try {
        const r = await fetch(base + '/api/movimientos/ajuste', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                insumo_id: id,
                cantidad,
                referencia: ref || 'Ajuste manual'
            })
        });
        if (r.ok) {
            bootstrap.Modal.getOrCreateInstance(document.getElementById('modalAjuste')).hide();
            await Swal.fire({ icon: 'success', title: 'Ajuste aplicado', timer: 1200, showConfirmButton: false });
            location.reload();
        } else {
            const e = await r.json();
            Swal.fire({ icon: 'error', title: 'Error', text: e.error || 'No se pudo aplicar' });
        }
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    } finally {
        setLoading(btn, false);
    }
});

function actualizarPreviewEditCosto() {
    const precio = parseFloat(document.getElementById('editPrecioCompra')?.value) || 0;
    const cantidad = parseFloat(document.getElementById('editCantidadCompra')?.value) || 1;
    const unidadBase = document.getElementById('editUnidadBase')?.value || 'g';
    const preview = document.getElementById('previewEditCosto');
    const previewValor = document.getElementById('previewEditCostoValor');
    const previewUnidad = document.getElementById('previewEditUnidadBase');
    if (preview && previewValor) {
        previewUnidad.textContent = unidadBase;
        if (precio > 0 && cantidad > 0) {
            const costoPorUnidad = precio / cantidad;
            previewValor.textContent = '$' + costoPorUnidad.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
            preview.style.display = '';
        } else {
            preview.style.display = 'none';
        }
    }
}
document.getElementById('editPrecioCompra')?.addEventListener('input', actualizarPreviewEditCosto);
document.getElementById('editCantidadCompra')?.addEventListener('input', actualizarPreviewEditCosto);
document.getElementById('editUnidadBase')?.addEventListener('change', actualizarPreviewEditCosto);

async function abrirEditarInsumo(id) {
    Swal.fire({
        title: 'Cargando datos...',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    try {
        const item = await apiFetch(`${base}/api/insumos/${id}`);
        Swal.close();

        if (!item) {
            alertError('Error', 'No se encontró la información del insumo.');
            return;
        }

        document.getElementById('editInsumoId').value = item.id;
        document.getElementById('editNombre').value = item.nombre;
        document.getElementById('editCodigo').value = item.codigo;
        document.getElementById('editCategoriaId').value = item.categoria_id || '';
        document.getElementById('editProveedorId').value = item.proveedor_id || '';
        document.getElementById('editUnidadBase').value = item.unidad_base || 'g';
        document.getElementById('editStockMinimo').value = item.stock_minimo || 0;

        document.getElementById('editCantidadCompra').value = item.cantidad_compra || 1;
        document.getElementById('editPrecioCompra').value = item.precio_compra || 0;
        document.getElementById('editRendimiento').value = item.rendimiento_pct != null ? item.rendimiento_pct : 100;

        const selectMedida = document.getElementById('editUnidadMedidaId');
        if (selectMedida) {
            selectMedida.value = item.unidad_medida_id || '';
        }

        const container = document.getElementById('editContainerPrecioVenta');
        if (item.categoria_nombre === 'Cerámicas') {
            container.classList.remove('d-none');
            document.getElementById('editPrecioVenta').value = item.precio_venta || 0;
        } else {
            container.classList.add('d-none');
        }

        actualizarPreviewEditCosto();
        const modalEl = document.getElementById('modalEditarInsumo');
        if (modalEl) {
            const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
            modal.show();
        } else {
            alertError('Error', 'El modal de edición no está disponible.');
        }
    } catch (e) {
        Swal.close();
        alertError('Error', 'No se pudo cargar la información del insumo: ' + e.message);
    }
}

document.getElementById('btnActualizarInsumo').addEventListener('click', async () => {
    const id = document.getElementById('editInsumoId').value;
    const btn = document.getElementById('btnActualizarInsumo');

    const payload = {
        nombre: document.getElementById('editNombre').value.trim(),
        codigo: document.getElementById('editCodigo').value.trim(),
        categoria_id: document.getElementById('editCategoriaId').value || null,
        proveedor_id: document.getElementById('editProveedorId').value || null,
        unidad_base: document.getElementById('editUnidadBase').value,
        stock_minimo: parseFloat(document.getElementById('editStockMinimo').value) || 0,
        cantidad_compra: parseFloat(document.getElementById('editCantidadCompra').value) || 1,
        precio_compra: parseFloat(document.getElementById('editPrecioCompra').value) || 0,
        rendimiento_pct: parseFloat(document.getElementById('editRendimiento').value) || 100,
        unidad_medida_id: document.getElementById('editUnidadMedidaId').value || null,
        precio_venta: parseFloat(document.getElementById('editPrecioVenta').value) || 0
    };

    if (!payload.nombre || !payload.codigo) {
        alertError('Campos requeridos', 'Por favor completa el nombre y el código.');
        return;
    }

    setLoading(btn, true);
    try {
        await apiFetch(`${base}/api/insumos/${id}`, 'PUT', payload);
        alertSuccess('Insumo actualizado', 'modalEditarInsumo');
        setTimeout(() => location.reload(), 1000);
    } catch (e) {
        alertError('Error al actualizar', e.message);
    } finally {
        setLoading(btn, false);
    }
});

async function eliminarInsumo(id, nombre) {
    const result = await Swal.fire({
        title: '¿Eliminar insumo?',
        text: `¿Estás seguro de que deseas eliminar "${nombre}"? Esta acción no se puede deshacer y puede afectar a las recetas que lo utilicen.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
        try {
            await apiFetch(`${base}/api/insumos/${id}`, 'DELETE');
            alertSuccess('Insumo eliminado');
            setTimeout(() => location.reload(), 1000);
        } catch (e) {
            alertError('Error al eliminar', e.message);
        }
    }
}

document.getElementById('editCategoriaId')?.addEventListener('change', function () {
    const selectedText = this.options[this.selectedIndex].text.trim();
    const container = document.getElementById('editContainerPrecioVenta');
    if (selectedText === 'Cerámicas') {
        container.classList.remove('d-none');
    } else {
        container.classList.add('d-none');
        document.getElementById('editPrecioVenta').value = '';
    }
});

(function () {
    const input = document.getElementById('buscarInsumo');
    if (!input) return;
    input.addEventListener('input', () => {
        const term = input.value.trim().toLowerCase();
        document.querySelectorAll('#tbodyInsumos .fila-insumo').forEach(row => {
            const codigo = (row.querySelector('[data-field="codigo"]')?.innerText || '').toLowerCase();
            const nombre = (row.querySelector('[data-field="nombre"]')?.innerText || '').toLowerCase();
            const match = !term || codigo.includes(term) || nombre.includes(term);
            row.style.display = match ? '' : 'none';
        });
        document.querySelectorAll('#listaInsumosMobile .insumo-card').forEach(card => {
            const codigo = (card.getAttribute('data-codigo') || '').toLowerCase();
            const nombre = (card.getAttribute('data-nombre') || '').toLowerCase();
            const match = !term || codigo.includes(term) || nombre.includes(term);
            card.style.display = match ? '' : 'none';
        });
    });
})();

(function () {
    let listaMercadoActual = [];
    const modal = document.getElementById('modalListaMercado');
    const ul = document.getElementById('listaMercadoItems');
    const vacio = document.getElementById('listaMercadoVacio');
    const incluirCerca = document.getElementById('listaMercadoIncluirCerca');

    function formatoNum(n) { return Number(n).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
    function renderLista(lista) {
        listaMercadoActual = lista || [];
        ul.innerHTML = '';
        if (!listaMercadoActual.length) {
            vacio.style.display = 'block';
            return;
        }
        vacio.style.display = 'none';
        const encabezado = document.createElement('li');
        encabezado.className = 'list-group-item d-flex justify-content-between align-items-center bg-light py-1';
        encabezado.innerHTML = '<small class="fw-semibold text-muted">INSUMO</small><small class="fw-semibold text-muted text-end">STOCK ACTUAL → MÍNIMO REQUERIDO</small>';
        ul.appendChild(encabezado);

        listaMercadoActual.forEach(function (it) {
            const li = document.createElement('li');
            const stockActual = parseFloat(it.stock_actual) || 0;
            const stockMin = parseFloat(it.stock_minimo) || 0;
            const falta = Math.max(0, stockMin - stockActual);
            const unidad = it.unidad_base || '';
            const sinStock = stockActual <= 0;

            let rowClass = 'list-group-item d-flex justify-content-between align-items-start flex-wrap gap-1 py-2';
            if (sinStock) rowClass += ' list-group-item-danger';
            else if (it.bajo) rowClass += ' list-group-item-warning';
            li.className = rowClass;

            const urgBadge = sinStock
                ? '<span class="badge bg-danger ms-2">Sin stock</span>'
                : '<span class="badge bg-warning text-dark ms-2">Bajo mínimo</span>';

            li.innerHTML =
                '<span class="fw-semibold">' + (it.nombre || it.codigo) + urgBadge + '</span>' +
                '<span class="text-end">' +
                '<span class="d-block small"><span class="text-muted">Tienes:</span> <strong>' + formatoNum(stockActual) + ' ' + unidad + '</strong></span>' +
                '<span class="d-block small"><span class="text-muted">Mínimo:</span> <strong>' + formatoNum(stockMin) + ' ' + unidad + '</strong></span>' +
                (falta > 0 ? '<span class="d-block small text-danger fw-bold">⬆ Comprar: ' + formatoNum(falta) + ' ' + unidad + '</span>' : '') +
                '</span>';
            ul.appendChild(li);
        });
    }
    async function cargarListaMercado() {
        const incluir = incluirCerca && incluirCerca.checked;
        const r = await fetch(base + '/api/lista-mercado?incluir_cerca=' + (incluir ? '1' : '0'), { credentials: 'same-origin' });
        if (!r.ok) { renderLista([]); return; }
        const data = await r.json();
        renderLista(data.lista || []);
    }
    document.getElementById('btnListaMercado').addEventListener('click', function () {
        incluirCerca.checked = false;
        cargarListaMercado();
        new bootstrap.Modal(modal).show();
    });
    if (incluirCerca) incluirCerca.addEventListener('change', cargarListaMercado);
    document.getElementById('btnListaMercadoCopiar').addEventListener('click', function () {
        const lineas = listaMercadoActual.map(function (it) {
            const stockActual = parseFloat(it.stock_actual) || 0;
            const stockMin = parseFloat(it.stock_minimo) || 0;
            const falta = Math.max(0, stockMin - stockActual);
            const u = it.unidad_base || '';
            let linea = (it.nombre || it.codigo) + ': Tienes ' + formatoNum(stockActual) + ' ' + u + ' / Mínimo ' + formatoNum(stockMin) + ' ' + u;
            if (falta > 0) linea += ' → COMPRAR: ' + formatoNum(falta) + ' ' + u;
            return linea;
        });
        const texto = 'LISTA DE MERCADO\n' + (new Date().toLocaleDateString('es-CO')) + '\n' + '─'.repeat(40) + '\n\n' + (lineas.length ? lineas.join('\n') : 'Nada por reponer.');
        navigator.clipboard.writeText(texto).then(function () {
            Swal.fire({
                icon: 'success',
                title: 'Listado copiado',
                text: 'La lista de mercado se copió al portapapeles.',
                timer: 2500,
                timerProgressBar: true,
                showConfirmButton: false
            });
        }).catch(function () {
            Swal.fire({ icon: 'error', title: 'No se pudo copiar', text: 'Comprueba que el navegador permita acceder al portapapeles.' });
        });
    });
    document.getElementById('btnListaMercadoImprimir').addEventListener('click', function () {
        const lineas = listaMercadoActual.map(function (it) {
            const stockActual = parseFloat(it.stock_actual) || 0;
            const stockMin = parseFloat(it.stock_minimo) || 0;
            const falta = Math.max(0, stockMin - stockActual);
            const u = it.unidad_base || '';
            let linea = (it.nombre || it.codigo) + ': Tienes ' + formatoNum(stockActual) + ' ' + u + ' / Mínimo ' + formatoNum(stockMin) + ' ' + u;
            if (falta > 0) linea += ' → Comprar: ' + formatoNum(falta) + ' ' + u;
            return linea;
        });
        const titulo = 'Lista de mercado - ' + (new Date().toLocaleDateString('es-CO'));
        const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + titulo + '</title><style>body{font-family:sans-serif;padding:1rem;} h1{font-size:1.25rem;} ul{list-style:none;padding:0;} li{padding:0.25rem 0;border-bottom:1px solid #eee;}</style></head><body><h1>' + titulo + '</h1><ul><li>' + (lineas.length ? lineas.join('</li><li>') : 'Nada por reponer.') + '</li></ul></body></html>';
        const w = window.open('', '_blank');
        w.document.write(html);
        w.document.close();
        w.print();
        w.close();
    });

    document.getElementById('btnAgregarProductosRapido').addEventListener('click', function () {
        if (listaMercadoActual.length === 0) {
            Swal.fire({ icon: 'info', title: 'Lista vacía', text: 'No hay productos para agregar en este momento.' });
            return;
        }

        Swal.fire({
            title: '¿Iniciar registro rápido?',
            text: `Se abrirán los modales de entrada para ${listaMercadoActual.length} insumos uno por uno.`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, comenzar',
            cancelButtonText: 'Cancelar'
        }).then((result) => {
            if (result.isConfirmed) {
                modoCompraRapida = true;
                colaInsumosCompra = [...listaMercadoActual];
                bootstrap.Modal.getInstance(document.getElementById('modalListaMercado')).hide();
                procesarSiguienteInsumo();
            }
        });
    });

    const btnCompraRapida = document.getElementById('btnCompraRapida');
    if (btnCompraRapida) {
        btnCompraRapida.addEventListener('click', () => {
            new bootstrap.Modal(document.getElementById('modalCompraRapida')).show();
        });
    }

    document.getElementById('btnSiguienteCompraRapida')?.addEventListener('click', () => {
        const input = document.getElementById('buscarInsumoCompra');
        const val = input.value;
        const datalist = document.getElementById('listaInsumosDatalist');
        const opts = datalist.options;
        let id = null;
        let nombre = '';

        for (let i = 0; i < opts.length; i++) {
            if (opts[i].value === val) {
                id = opts[i].getAttribute('data-id');
                nombre = val.split(' (')[0];
                break;
            }
        }

        if (!id) {
            Swal.fire({ icon: 'warning', title: 'Insumo no encontrado', text: 'Por favor selecciona un insumo de la lista.' });
            return;
        }

        bootstrap.Modal.getInstance(document.getElementById('modalCompraRapida')).hide();
        input.value = '';
        abrirEntrada(id, nombre);
    });
})();

// Delegar eventos de acciones de inventario para cumplir con CSP
(function () {
    const handleActionClick = (e) => {
        const btn = e.target.closest('.btn-action-entrada, .btn-action-salida, .btn-action-ajuste, .btn-action-movimientos, .btn-action-editar, .btn-action-eliminar');
        if (!btn) return;

        e.preventDefault();
        const id = btn.getAttribute('data-id');
        const nombre = (btn.getAttribute('data-nombre') || '').replace(/&quot;/g, '"');
        const stock = btn.getAttribute('data-stock');

        if (btn.classList.contains('btn-action-entrada')) {
            abrirEntrada(id, nombre);
        } else if (btn.classList.contains('btn-action-salida')) {
            abrirSalida(id, nombre, stock);
        } else if (btn.classList.contains('btn-action-ajuste')) {
            abrirAjuste(id, nombre, stock);
        } else if (btn.classList.contains('btn-action-movimientos')) {
            verMovimientos(id, nombre);
        } else if (btn.classList.contains('btn-action-editar')) {
            abrirEditarInsumo(id);
        } else if (btn.classList.contains('btn-action-eliminar')) {
            eliminarInsumo(id, nombre);
        }
    };

    const tbody = document.getElementById('tbodyInsumos');
    if (tbody) {
        tbody.addEventListener('click', handleActionClick);
    }
    const mobileList = document.getElementById('listaInsumosMobile');
    if (mobileList) {
        mobileList.addEventListener('click', handleActionClick);
    }
})();

