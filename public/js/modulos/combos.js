// CRUD de combos fijos (producto a precio fijo + lista de productos que incluye).
// Modal en 2 pasos: 1) elegir productos (se ve cuánto suman), 2) nombre, precio y categoría.
// Sin onclick inline (delegación de eventos). Datos del catálogo vienen en #combosProductos.

(function () {
    const productos = JSON.parse(document.getElementById('combosProductos')?.textContent || '[]');
    const productoPorId = new Map(productos.map(p => [p.id, p]));

    // producto_id -> cantidad (el Map conserva el orden en que se agregaron)
    const seleccion = new Map();
    let resultadoActivo = 0;
    let paso = 1;

    const $ = id => document.getElementById(id);

    function getModal() {
        const el = $('modalCombo');
        return el ? bootstrap.Modal.getOrCreateInstance(el) : null;
    }

    function sumaSeparado() {
        let suma = 0;
        for (const [id, cantidad] of seleccion) {
            suma += (productoPorId.get(id)?.precio || 0) * cantidad;
        }
        return suma;
    }

    // ---------- Errores inline ----------
    function marcarError(campoId, errId, mensaje) {
        $(campoId).classList.toggle('is-invalid', !!mensaje);
        $(errId).textContent = mensaje || '';
    }

    function limpiarErrores() {
        marcarError('comboNombre', 'errComboNombre', '');
        marcarError('comboPrecio', 'errComboPrecio', '');
        marcarError('comboCategoria', 'errComboCategoria', '');
        for (const id of ['errComboComponentes', 'errComboGeneral']) {
            $(id).classList.add('d-none');
            $(id).textContent = '';
        }
    }

    function mostrarError(id, mensaje) {
        $(id).textContent = mensaje;
        $(id).classList.remove('d-none');
    }

    // ---------- Pasos ----------
    function irPaso(n) {
        paso = n;
        $('comboPaso1').classList.toggle('d-none', n !== 1);
        $('comboPaso2').classList.toggle('d-none', n !== 2);

        $('indicadorPaso1').classList.toggle('activo', n === 1);
        $('indicadorPaso1').classList.toggle('hecho', n === 2);
        $('indicadorPaso2').classList.toggle('activo', n === 2);
        $('indicadorPaso1').toggleAttribute('aria-current', n === 1);
        $('indicadorPaso2').toggleAttribute('aria-current', n === 2);

        $('btnComboCancelar').classList.toggle('d-none', n !== 1);
        $('btnComboSiguiente').classList.toggle('d-none', n !== 1);
        $('btnComboAtras').classList.toggle('d-none', n !== 2);
        $('btnGuardarCombo').classList.toggle('d-none', n !== 2);

        if (n === 2) {
            renderRecap();
            renderSugeridos();
            sugerirCategoria();
        }
        actualizarResumen();
        $('modalCombo').querySelector('.modal-body').scrollTop = 0;
        (n === 1 ? $('comboBuscar') : $('comboNombre')).focus();
    }

    // ---------- Paso 1: lista de productos del combo ----------
    function formatoCantidad(n) {
        return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
    }

    function renderComponentes(idNuevo) {
        const lista = $('comboComponentes');
        $('comboVacio').classList.toggle('d-none', seleccion.size > 0);

        lista.innerHTML = [...seleccion]
            .map(([id, cantidad]) => {
                const p = productoPorId.get(id);
                if (!p) return '';
                const nombre = GF.escapeHtml(p.nombre);
                return `
                <div class="list-group-item combo-fila d-flex align-items-center gap-2 gap-sm-3 ${id === idNuevo ? 'combo-fila-nueva' : ''}" data-id="${id}">
                    <div class="combo-fila-info flex-grow-1 text-truncate">
                        <div class="fw-medium text-truncate">${nombre}</div>
                        <div class="small text-muted">${GF.dinero(p.precio)} c/u</div>
                    </div>
                    <div class="input-group flex-nowrap w-auto" role="group" aria-label="Cantidad de ${nombre}">
                        <button type="button" class="btn btn-outline-secondary combo-touch" data-accion="menos" aria-label="Quitar una unidad de ${nombre}"><i class="bi bi-dash-lg"></i></button>
                        <input type="number" class="form-control combo-cantidad-input combos-sin-spinner" min="0.01" step="any" value="${formatoCantidad(cantidad)}" aria-label="Cantidad de ${nombre}">
                        <button type="button" class="btn btn-outline-secondary combo-touch" data-accion="mas" aria-label="Agregar una unidad de ${nombre}"><i class="bi bi-plus-lg"></i></button>
                    </div>
                    <div class="text-end fw-semibold combo-fila-subtotal" style="min-width: 84px">${GF.dinero(p.precio * cantidad)}</div>
                    <button type="button" class="btn btn-link text-danger combo-touch" data-accion="quitar" aria-label="Quitar ${nombre} del combo"><i class="bi bi-trash"></i></button>
                </div>`;
            })
            .join('');

        actualizarResumen();
    }

    function agregarProducto(id) {
        seleccion.set(id, (seleccion.get(id) || 0) + 1);
        $('errComboComponentes').classList.add('d-none');
        renderComponentes(id);
    }

    // Elegir un producto desde el buscador: se agrega, el buscador se limpia y se cierra
    // para que el producto agregado quede a la vista (el foco se queda en el input).
    function elegirProducto(id) {
        agregarProducto(id);
        $('comboBuscar').value = '';
        cerrarResultados();
        $('comboComponentes').querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });
    }

    // ---------- Buscador ----------
    function coincidencias(texto) {
        const q = texto.trim().toLowerCase();
        const lista = q
            ? productos.filter(p => p.nombre.toLowerCase().includes(q) || (p.codigo || '').toLowerCase().includes(q))
            : productos;
        return lista.slice(0, 8);
    }

    function renderResultados() {
        const cont = $('comboResultados');
        const res = coincidencias($('comboBuscar').value);
        resultadoActivo = Math.min(resultadoActivo, Math.max(res.length - 1, 0));

        if (res.length === 0) {
            cont.innerHTML = '<div class="list-group-item text-muted">No encontramos ese producto.</div>';
        } else {
            cont.innerHTML = res
                .map((p, i) => {
                    const yaEsta = seleccion.has(p.id);
                    return `
                    <button type="button" class="list-group-item list-group-item-action combo-resultado d-flex align-items-center gap-2 ${i === resultadoActivo ? 'activo' : ''}" role="option" data-id="${p.id}">
                        <span class="flex-grow-1 text-truncate">${GF.escapeHtml(p.nombre)}
                            ${p.categoria ? `<span class="small text-muted ms-1">${GF.escapeHtml(p.categoria)}</span>` : ''}
                        </span>
                        ${yaEsta ? '<span class="badge text-bg-primary">En el combo · ' + formatoCantidad(seleccion.get(p.id)) + '</span>' : ''}
                        <span class="text-muted">${GF.dinero(p.precio)}</span>
                    </button>`;
                })
                .join('');
        }
        cont.classList.remove('d-none');
    }

    function cerrarResultados() {
        $('comboResultados').classList.add('d-none');
    }

    // ---------- Paso 2: resumen, precios sugeridos y categoría ----------
    function renderRecap() {
        const filas = [...seleccion]
            .map(([id, cantidad]) => {
                const p = productoPorId.get(id);
                if (!p) return '';
                return `<div class="combo-recap-fila"><span>${cantidad !== 1 ? formatoCantidad(cantidad) + '× ' : ''}${GF.escapeHtml(p.nombre)}</span><span>${GF.dinero(p.precio * cantidad)}</span></div>`;
            })
            .join('');
        $('comboRecap').innerHTML =
            filas + `<div class="combo-recap-total"><span>Por separado costarían</span><span>${GF.dinero(sumaSeparado())}</span></div>`;
    }

    // Botones de precio con 10/15/20% de descuento, redondeados a $500.
    function renderSugeridos() {
        const suma = sumaSeparado();
        $('comboSugeridos').innerHTML = [10, 15, 20]
            .map(pct => {
                const precio = Math.max(500, Math.round((suma * (1 - pct / 100)) / 500) * 500);
                return `<button type="button" class="btn btn-sm btn-outline-secondary" data-precio="${precio}" title="Descuento de ${pct}% sobre el precio por separado">${GF.dinero(precio)} <span class="text-muted">(-${pct}%)</span></button>`;
            })
            .join('');
    }

    // Si aún no hay categoría, propone la que más se repite entre los productos elegidos.
    function sugerirCategoria() {
        if ($('comboCategoria').value) return;
        const cuenta = new Map();
        for (const id of seleccion.keys()) {
            const cat = productoPorId.get(id)?.categoriaId;
            if (cat) cuenta.set(cat, (cuenta.get(cat) || 0) + 1);
        }
        const mejor = [...cuenta].sort((a, b) => b[1] - a[1])[0]?.[0];
        if (mejor && [...$('comboCategoria').options].some(o => o.value === String(mejor))) {
            $('comboCategoria').value = String(mejor);
        }
    }

    // ---------- Resumen del pie (cambia según el paso) ----------
    function actualizarResumen() {
        const suma = sumaSeparado();
        const cont = $('comboResumen');

        if (seleccion.size === 0) {
            cont.innerHTML = '<span class="text-muted">Agrega al menos un producto para continuar.</span>';
            return;
        }
        const linea1 = `<div class="text-muted">${seleccion.size} producto${seleccion.size === 1 ? '' : 's'} · por separado: <strong>${GF.dinero(suma)}</strong></div>`;

        if (paso === 1) {
            cont.innerHTML = linea1;
            return;
        }
        const precio = Number($('comboPrecio').value) || 0;
        let linea2;
        if (precio <= 0) {
            linea2 = '<span class="text-muted">Escribe el precio del combo.</span>';
        } else if (precio <= suma) {
            const pct = Math.round(((suma - precio) / suma) * 100);
            linea2 = `<span class="text-success fw-semibold"><i class="bi bi-piggy-bank me-1"></i>El cliente ahorra ${GF.dinero(suma - precio)} (${pct}%)</span>`;
        } else {
            linea2 = `<span class="text-warning-emphasis fw-semibold"><i class="bi bi-exclamation-triangle me-1"></i>Sale ${GF.dinero(precio - suma)} más caro que por separado</span>`;
        }
        cont.innerHTML = linea1 + linea2;
    }

    // ---------- Formulario ----------
    function limpiarFormulario() {
        $('comboId').value = '';
        $('comboNombre').value = '';
        $('comboPrecio').value = '';
        $('comboCategoria').value = '';
        $('comboBuscar').value = '';
        seleccion.clear();
        limpiarErrores();
        cerrarResultados();
        $('modalComboTitulo').textContent = 'Nuevo combo';
        renderComponentes();
        irPaso(1);
    }

    function abrirNuevo() {
        limpiarFormulario();
        getModal()?.show();
    }

    async function abrirEditar(fila) {
        try {
            const c = await GF.api(`/combos/${fila.dataset.id}`, {}, 'No se pudo cargar el combo');
            limpiarFormulario();
            $('comboId').value = c.id;
            $('comboNombre').value = c.nombre;
            $('comboPrecio').value = Number(c.precio_unidad);
            $('comboCategoria').value = c.categoria_id || '';
            for (const comp of c.componentes || []) {
                seleccion.set(comp.producto_id, Number(comp.cantidad));
            }
            $('modalComboTitulo').textContent = 'Editar combo';
            renderComponentes();
            getModal()?.show();
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        }
    }

    // Paso 1 -> 2: hace falta al menos un producto con cantidad válida.
    function siguiente() {
        $('errComboComponentes').classList.add('d-none');
        if (seleccion.size === 0) {
            mostrarError('errComboComponentes', 'Agrega al menos un producto al combo.');
            $('comboBuscar').focus();
            return;
        }
        if ([...seleccion.values()].some(c => !(c > 0))) {
            mostrarError('errComboComponentes', 'Cada producto debe tener una cantidad mayor a 0.');
            return;
        }
        irPaso(2);
    }

    // Valida el paso 2 y deja cada error junto a su campo. Devuelve true si todo está bien.
    function validarPaso2() {
        limpiarErrores();
        let primerError = null;
        const falla = (campoId, errId, mensaje) => {
            marcarError(campoId, errId, mensaje);
            primerError = primerError || $(campoId);
        };

        if (!$('comboNombre').value.trim()) falla('comboNombre', 'errComboNombre', 'Escribe un nombre para el combo.');
        if (!(Number($('comboPrecio').value) > 0)) falla('comboPrecio', 'errComboPrecio', 'Escribe un precio mayor a 0.');
        if (!$('comboCategoria').value) falla('comboCategoria', 'errComboCategoria', 'Elige una categoría.');

        primerError?.focus();
        return !primerError;
    }

    async function guardar() {
        if (!validarPaso2()) return;

        const id = $('comboId').value;
        const payload = {
            nombre: $('comboNombre').value.trim(),
            precio_unidad: Number($('comboPrecio').value),
            categoria_id: Number($('comboCategoria').value),
            componentes: [...seleccion].map(([producto_id, cantidad]) => ({ producto_id, cantidad }))
        };

        const boton = $('btnGuardarCombo');
        GF.cargando(boton, true);
        try {
            await GF.api(
                id ? `/combos/${id}` : '/combos',
                { method: id ? 'PUT' : 'POST', body: payload },
                'No se pudo guardar el combo'
            );
            getModal()?.hide();
            location.reload();
        } catch (error) {
            GF.cargando(boton, false);
            mostrarError('errComboGeneral', error.message);
        }
    }

    async function borrar(fila) {
        const result = await Swal.fire({
            title: '¿Eliminar este combo?',
            text: 'Dejará de venderse de inmediato. Las ventas anteriores no cambian.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar'
        });
        if (!result.isConfirmed) return;

        try {
            await GF.api(`/combos/${fila.dataset.id}`, { method: 'DELETE' }, 'No se pudo eliminar');
            location.reload();
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        }
    }

    // ---------- Eventos ----------
    function onCambioCantidadFila(input) {
        const id = Number(input.closest('[data-id]').dataset.id);
        const valor = Number(input.value);
        seleccion.set(id, valor > 0 ? valor : 0);
        // Solo se refresca el subtotal y el resumen: re-renderizar la fila le quitaría el foco al input.
        const sub = input.closest('[data-id]').querySelector('.combo-fila-subtotal');
        if (sub) sub.textContent = GF.dinero((productoPorId.get(id)?.precio || 0) * (valor > 0 ? valor : 0));
        actualizarResumen();
    }

    document.addEventListener('DOMContentLoaded', function () {
        $('btnNuevoCombo')?.addEventListener('click', abrirNuevo);
        $('btnNuevoComboVacio')?.addEventListener('click', abrirNuevo);
        $('btnComboSiguiente')?.addEventListener('click', siguiente);
        $('btnComboAtras')?.addEventListener('click', () => irPaso(1));
        $('btnGuardarCombo')?.addEventListener('click', guardar);

        $('comboPrecio')?.addEventListener('input', () => {
            marcarError('comboPrecio', 'errComboPrecio', '');
            actualizarResumen();
        });
        $('comboNombre')?.addEventListener('input', () => marcarError('comboNombre', 'errComboNombre', ''));
        $('comboCategoria')?.addEventListener('change', () => marcarError('comboCategoria', 'errComboCategoria', ''));
        // Enter en nombre/precio avanza al guardado, como cualquier formulario
        for (const id of ['comboNombre', 'comboPrecio']) {
            $(id)?.addEventListener('keydown', event => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    guardar();
                }
            });
        }
        $('comboSugeridos')?.addEventListener('click', event => {
            const boton = event.target.closest('[data-precio]');
            if (!boton) return;
            $('comboPrecio').value = boton.dataset.precio;
            marcarError('comboPrecio', 'errComboPrecio', '');
            actualizarResumen();
        });

        // Buscador: aparece al enfocar/escribir; Enter agrega el resaltado; flechas navegan; Esc cierra.
        const buscar = $('comboBuscar');
        buscar?.addEventListener('focus', () => {
            resultadoActivo = 0;
            renderResultados();
        });
        // El input ya enfocado no vuelve a disparar "focus": un clic reabre la lista.
        buscar?.addEventListener('click', () => {
            if ($('comboResultados').classList.contains('d-none')) renderResultados();
        });
        buscar?.addEventListener('input', () => {
            resultadoActivo = 0;
            renderResultados();
        });
        buscar?.addEventListener('keydown', event => {
            const res = coincidencias(buscar.value);
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                resultadoActivo = (resultadoActivo + (event.key === 'ArrowDown' ? 1 : -1) + res.length) % (res.length || 1);
                renderResultados();
            } else if (event.key === 'Enter') {
                event.preventDefault();
                if (res[resultadoActivo] && !$('comboResultados').classList.contains('d-none')) {
                    elegirProducto(res[resultadoActivo].id);
                } else {
                    renderResultados();
                }
            } else if (event.key === 'Escape' && !$('comboResultados').classList.contains('d-none')) {
                event.stopPropagation(); // que Esc cierre la lista y no todo el modal
                cerrarResultados();
            }
        });
        $('comboResultados')?.addEventListener('mousedown', event => {
            // mousedown (no click) para ganarle al blur del input
            const item = event.target.closest('[data-id]');
            if (!item) return;
            event.preventDefault();
            elegirProducto(Number(item.dataset.id));
        });
        document.addEventListener('click', event => {
            if (!event.target.closest('#comboBuscar, #comboResultados')) cerrarResultados();
        });

        const lista = $('comboComponentes');
        lista?.addEventListener('click', event => {
            const boton = event.target.closest('[data-accion]');
            if (!boton) return;
            const id = Number(boton.closest('[data-id]').dataset.id);
            const accion = boton.dataset.accion;
            if (accion === 'quitar') {
                seleccion.delete(id);
            } else {
                const actual = seleccion.get(id) || 0;
                // − nunca baja de 1: para sacar el producto está el tacho
                seleccion.set(id, accion === 'mas' ? actual + 1 : Math.max(1, actual - 1));
            }
            renderComponentes();
        });
        lista?.addEventListener('input', event => {
            if (event.target.matches('.combo-cantidad-input')) onCambioCantidadFila(event.target);
        });

        $('combosTbody')?.addEventListener('click', event => {
            const fila = event.target.closest('tr[data-id]');
            if (!fila) return;
            if (event.target.closest('.btn-editar-combo')) abrirEditar(fila);
            else if (event.target.closest('.btn-borrar-combo')) borrar(fila);
        });

        $('modalCombo')?.addEventListener('shown.bs.modal', () => $('comboBuscar').focus());
    });
})();
