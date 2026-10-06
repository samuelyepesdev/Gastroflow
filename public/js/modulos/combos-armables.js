// Asistente de combos armables en 3 pasos:
//   1) Qué incluye siempre (productos fijos)  2) Qué elige el cliente (opcional)  3) Nombre y precio.
// Internamente se guarda como grupos (ver ComboArmableService): lo fijo es UN grupo "Incluye" donde entra
// todo, y cada elección del cliente es un grupo con sus opciones. El servidor valida todo de nuevo.
// Sin onclick inline (delegación de eventos). Catálogo de productos en #combosProductos.

(function () {
    const productos = JSON.parse(document.getElementById('combosProductos')?.textContent || '[]');
    const productoPorId = new Map(productos.map(p => [p.id, p]));
    const etiqueta = p => (p.codigo ? `${p.nombre} (${p.codigo})` : p.nombre);
    const productoPorEtiqueta = new Map(productos.map(p => [etiqueta(p), p]));

    // Paso 1: producto_id -> cantidad (el Map conserva el orden en que se agregaron)
    const fijos = new Map();
    // Paso 2: [{ nombre, opcional, cuantas, opciones: [{ producto_id, cantidad, recargo, es_default }] }]
    let elecciones = [];
    let resultadoActivo = 0;
    let paso = 1;
    const TOTAL_PASOS = 3;

    const ATAJOS = {
        bebida: { nombre: 'Elige tu bebida', opcional: false, cuantas: 1 },
        acompanante: { nombre: 'Elige tu acompañante', opcional: false, cuantas: 1 },
        adicional: { nombre: 'Adicionales', opcional: true, cuantas: 2 }
    };

    const $ = id => document.getElementById(id);
    const formatoCantidad = n => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2))));

    function getModal() {
        const el = $('modalCombo');
        return el ? bootstrap.Modal.getOrCreateInstance(el) : null;
    }

    // ---------- Precios ----------
    // Lo que costaría por separado: lo fijo + lo MÁS barato que el cliente tendría que escoger en cada elección.
    function sumaSeparado() {
        let suma = 0;
        for (const [id, cantidad] of fijos) {
            suma += (productoPorId.get(id)?.precio || 0) * cantidad;
        }
        for (const e of elecciones) {
            const n = e.opcional ? 0 : Math.min(Number(e.cuantas) || 0, e.opciones.length);
            suma += e.opciones
                .map(o => (productoPorId.get(Number(o.producto_id))?.precio || 0) * (Number(o.cantidad) || 1))
                .sort((a, b) => a - b)
                .slice(0, n)
                .reduce((a, b) => a + b, 0);
        }
        return suma;
    }

    // ---------- Errores ----------
    function marcarError(campoId, errId, mensaje) {
        $(campoId).classList.toggle('is-invalid', !!mensaje);
        $(errId).textContent = mensaje || '';
    }

    function mostrarGeneral(mensaje) {
        $('errComboGeneral').textContent = mensaje || '';
        $('errComboGeneral').classList.toggle('d-none', !mensaje);
    }

    function limpiarErrores() {
        marcarError('comboNombre', 'errComboNombre', '');
        marcarError('comboPrecio', 'errComboPrecio', '');
        mostrarGeneral('');
    }

    // ---------- Pasos ----------
    function irPaso(n) {
        paso = n;
        for (let i = 1; i <= TOTAL_PASOS; i++) {
            $(`comboPaso${i}`).classList.toggle('d-none', i !== n);
            const ind = $(`indicadorPaso${i}`);
            ind.classList.toggle('activo', i === n);
            ind.classList.toggle('hecho', i < n);
            ind.toggleAttribute('aria-current', i === n);
        }
        $('btnComboCancelar').classList.toggle('d-none', n !== 1);
        $('btnComboAtras').classList.toggle('d-none', n === 1);
        $('btnComboSiguiente').classList.toggle('d-none', n === TOTAL_PASOS);
        $('btnGuardarCombo').classList.toggle('d-none', n !== TOTAL_PASOS);

        if (n === 2) renderElecciones();
        if (n === 3) {
            renderRecap();
            renderSugeridos();
        }
        mostrarGeneral('');
        actualizarResumen();
        $('modalCombo').querySelector('.modal-body').scrollTop = 0;
        if (n === 1) $('comboBuscar').focus();
        else if (n === 3) $('comboNombre').focus();
    }

    // ---------- Paso 1: lo que siempre incluye ----------
    function renderFijos(idNuevo) {
        $('comboVacio').classList.toggle('d-none', fijos.size > 0);
        $('comboComponentes').innerHTML = [...fijos]
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

    function elegirProducto(id) {
        fijos.set(id, (fijos.get(id) || 0) + 1);
        $('comboBuscar').value = '';
        cerrarResultados();
        renderFijos(id);
        $('comboComponentes').querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });
    }

    // ---------- Buscador del paso 1 ----------
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

        cont.innerHTML =
            res.length === 0
                ? '<div class="list-group-item text-muted">No encontramos ese producto.</div>'
                : res
                      .map(
                          (p, i) => `
                    <button type="button" class="list-group-item list-group-item-action combo-resultado d-flex align-items-center gap-2 ${i === resultadoActivo ? 'activo' : ''}" role="option" data-id="${p.id}">
                        <span class="flex-grow-1 text-truncate">${GF.escapeHtml(p.nombre)}
                            ${p.categoria ? `<span class="small text-muted ms-1">${GF.escapeHtml(p.categoria)}</span>` : ''}
                        </span>
                        ${fijos.has(p.id) ? '<span class="badge text-bg-primary">En el combo · ' + formatoCantidad(fijos.get(p.id)) + '</span>' : ''}
                        <span class="text-muted">${GF.dinero(p.precio)}</span>
                    </button>`
                      )
                      .join('');
        cont.classList.remove('d-none');
    }

    function cerrarResultados() {
        $('comboResultados').classList.add('d-none');
    }

    // ---------- Paso 2: lo que elige el cliente ----------
    function renderOpcionEleccion(o, i, j) {
        const p = productoPorId.get(Number(o.producto_id));
        if (!p) return '';
        const nombre = GF.escapeHtml(p.nombre);
        return `
            <div class="d-flex align-items-center gap-2 mb-2" data-o="${j}">
                <div class="flex-grow-1 text-truncate">
                    <span class="fw-medium">${Number(o.cantidad) !== 1 ? formatoCantidad(Number(o.cantidad)) + '× ' : ''}${nombre}</span>
                    <span class="small text-muted ms-1 d-none d-sm-inline">${GF.dinero(p.precio)}</span>
                </div>
                <div class="input-group input-group-sm flex-nowrap" style="width: 150px" title="Lo que se suma al precio del combo si el cliente escoge esta opción">
                    <span class="input-group-text">Cuesta +$</span>
                    <input type="number" class="form-control combos-sin-spinner" data-campo="recargo" min="0" step="1"
                        inputmode="numeric" placeholder="0" value="${Number(o.recargo) > 0 ? Number(o.recargo) : ''}" aria-label="Cuesta más al escoger ${nombre}">
                </div>
                <button type="button" class="btn btn-link text-danger combo-touch" data-accion="quitar-opcion" aria-label="Quitar ${nombre}"><i class="bi bi-x-lg"></i></button>
            </div>`;
    }

    function renderEleccion(e, i) {
        return `
            <div class="card border mb-3" data-e="${i}">
                <div class="card-body">
                    <div class="d-flex gap-2 align-items-end mb-3">
                        <div class="flex-grow-1">
                            <label class="form-label small mb-1">¿Qué escoge el cliente?</label>
                            <input type="text" class="form-control" data-campo="nombre" maxlength="100" autocomplete="off"
                                placeholder="Ej. Elige tu bebida" value="${GF.escapeHtml(e.nombre)}">
                        </div>
                        <button type="button" class="btn btn-outline-danger combo-touch" data-accion="quitar-eleccion" aria-label="Quitar esta elección"><i class="bi bi-trash"></i></button>
                    </div>
                    <div class="d-flex flex-wrap gap-3 align-items-center mb-3">
                        <label class="small d-flex align-items-center gap-2 mb-0">Puede escoger
                            <input type="number" class="form-control form-control-sm text-center" data-campo="cuantas" min="1" step="1" style="width: 64px"
                                value="${GF.escapeHtml(String(e.cuantas))}">
                            ${Number(e.cuantas) === 1 ? 'opción' : 'opciones'}
                        </label>
                        <div class="form-check form-switch mb-0">
                            <input class="form-check-input" type="checkbox" role="switch" data-campo="opcional" id="opc-${i}"${e.opcional ? ' checked' : ''}>
                            <label class="form-check-label small" for="opc-${i}">Es opcional (puede no escoger nada)</label>
                        </div>
                    </div>
                    <div class="small text-muted mb-1">Opciones entre las que escoge:</div>
                    ${e.opciones.map((o, j) => renderOpcionEleccion(o, i, j)).join('') || '<div class="combo-vacio py-2 mb-2 small">Aún no hay opciones.</div>'}
                    <input type="text" class="form-control form-control-sm" data-agregar-opcion list="comboProductosLista"
                        placeholder="＋ Escribe para buscar y agregar un producto…" autocomplete="off" aria-label="Agregar un producto a esta elección">
                </div>
            </div>`;
    }

    function renderElecciones() {
        $('comboElecciones').innerHTML = elecciones.map(renderEleccion).join('');
        actualizarResumen();
    }

    function agregarEleccion(base) {
        elecciones.push({
            nombre: '',
            opcional: false,
            cuantas: 1,
            opciones: [],
            ...(base || {})
        });
        renderElecciones();
        $('comboElecciones').querySelector(`[data-e="${elecciones.length - 1}"] [data-campo="nombre"]`)?.focus();
    }

    function agregarOpcion(i, producto) {
        const e = elecciones[i];
        if (!e || e.opciones.some(o => Number(o.producto_id) === producto.id)) return;
        e.opciones.push({ producto_id: producto.id, cantidad: 1, recargo: 0, es_default: false });
        renderElecciones();
        $('comboElecciones').querySelector(`[data-e="${i}"] [data-agregar-opcion]`)?.focus();
    }

    // "Puede escoger N" nunca pasa de las opciones que hay, y mínimo 1.
    function ajustarCuantas(e) {
        const tope = Math.max(e.opciones.length, 1);
        e.cuantas = Math.min(Math.max(Number.parseInt(e.cuantas, 10) || 1, 1), tope);
    }

    // ---------- Paso 3: resumen, precios sugeridos ----------
    function renderRecap() {
        const filas = [];
        for (const [id, cantidad] of fijos) {
            const p = productoPorId.get(id);
            if (p) {
                filas.push(
                    `<div class="combo-recap-fila"><span>${cantidad !== 1 ? formatoCantidad(cantidad) + '× ' : ''}${GF.escapeHtml(p.nombre)}</span><span>${GF.dinero(p.precio * cantidad)}</span></div>`
                );
            }
        }
        for (const e of elecciones) {
            const nombres = e.opciones
                .map(o => {
                    const p = productoPorId.get(Number(o.producto_id));
                    return p ? GF.escapeHtml(p.nombre) + (Number(o.recargo) > 0 ? ` (+${GF.dinero(Number(o.recargo))})` : '') : '';
                })
                .filter(Boolean)
                .join(', ');
            const regla = e.opcional ? `Opcional, hasta ${e.cuantas}` : e.cuantas === 1 ? 'Elige 1' : `Elige ${e.cuantas}`;
            filas.push(
                `<div class="combo-recap-fila"><span><strong>${GF.escapeHtml(e.nombre || 'Elección')}</strong> <span class="text-muted">· ${regla} de: ${nombres}</span></span></div>`
            );
        }
        const desde = elecciones.length > 0 ? 'Por separado costaría desde' : 'Por separado costarían';
        $('comboRecap').innerHTML =
            filas.join('') + `<div class="combo-recap-total"><span>${desde}</span><span>${GF.dinero(sumaSeparado())}</span></div>`;
    }

    // Botones de precio con 10/15/20% de descuento, redondeados a $500.
    function renderSugeridos() {
        const suma = sumaSeparado();
        $('comboSugeridos').innerHTML =
            suma <= 0
                ? ''
                : [10, 15, 20]
                      .map(pct => {
                          const precio = Math.max(500, Math.round((suma * (1 - pct / 100)) / 500) * 500);
                          return `<button type="button" class="btn btn-sm btn-outline-secondary" data-precio="${precio}" title="Descuento de ${pct}% sobre el precio por separado">${GF.dinero(precio)} <span class="text-muted">(-${pct}%)</span></button>`;
                      })
                      .join('');
    }

    // ---------- Resumen del pie ----------
    function actualizarResumen() {
        const cont = $('comboResumen');
        const nFijos = fijos.size;
        const nElec = elecciones.length;
        const partes = [];
        if (nFijos) partes.push(`${nFijos} producto${nFijos === 1 ? '' : 's'} fijo${nFijos === 1 ? '' : 's'}`);
        if (nElec) partes.push(`${nElec} elección${nElec === 1 ? '' : 'es'}`);
        if (partes.length === 0) {
            cont.innerHTML = '<span class="text-muted">Agrega productos o una elección para armar el combo.</span>';
            return;
        }
        const suma = sumaSeparado();
        let html = `<div class="text-muted">${partes.join(' · ')} · por separado: <strong>${GF.dinero(suma)}</strong></div>`;
        if (paso === 3) {
            const precio = Number($('comboPrecio').value) || 0;
            if (precio <= 0) {
                html += '<span class="text-muted">Escribe el precio del combo.</span>';
            } else if (precio <= suma) {
                const pct = suma > 0 ? Math.round(((suma - precio) / suma) * 100) : 0;
                html += `<span class="text-success fw-semibold"><i class="bi bi-piggy-bank me-1"></i>El cliente ahorra ${GF.dinero(suma - precio)} (${pct}%)</span>`;
            } else {
                html += `<span class="text-warning-emphasis fw-semibold"><i class="bi bi-exclamation-triangle me-1"></i>Sale ${GF.dinero(precio - suma)} más caro que por separado</span>`;
            }
        }
        cont.innerHTML = html;
    }

    // ---------- Validación por paso ----------
    function validarPaso1() {
        if ([...fijos.values()].some(c => !(c > 0))) {
            mostrarGeneral('Cada producto debe tener una cantidad mayor a 0.');
            return false;
        }
        return true;
    }

    function validarPaso2() {
        // "Puede escoger N" nunca pasa de las opciones que hay: se ajusta solo, sin molestar con un error.
        const antes = elecciones.map(e => String(e.cuantas)).join();
        elecciones.forEach(ajustarCuantas);
        if (antes !== elecciones.map(e => String(e.cuantas)).join()) renderElecciones();

        for (const e of elecciones) {
            const nombre = e.nombre.trim() || 'sin nombre';
            if (!e.nombre.trim()) {
                mostrarGeneral('Ponle un nombre a cada elección (por ejemplo "Elige tu bebida").');
                return false;
            }
            const minOpciones = e.opcional ? 1 : 2;
            if (e.opciones.length < minOpciones) {
                mostrarGeneral(
                    e.opcional
                        ? `Agrega al menos una opción a "${nombre}".`
                        : `Agrega al menos 2 opciones a "${nombre}" para que el cliente pueda escoger (si es una sola, ponla en "Qué incluye").`
                );
                return false;
            }
        }
        if (fijos.size === 0 && elecciones.length === 0) {
            mostrarGeneral('Agrega al menos un producto fijo o una elección para el cliente.');
            return false;
        }
        return true;
    }

    function validarPaso3() {
        limpiarErrores();
        let primerError = null;
        const falla = (campoId, errId, mensaje) => {
            marcarError(campoId, errId, mensaje);
            primerError = primerError || $(campoId);
        };
        if (!$('comboNombre').value.trim()) falla('comboNombre', 'errComboNombre', 'Escribe un nombre para el combo.');
        if (!(Number($('comboPrecio').value) > 0)) falla('comboPrecio', 'errComboPrecio', 'Escribe un precio mayor a 0.');
        primerError?.focus();
        return !primerError;
    }

    function siguiente() {
        mostrarGeneral('');
        if (paso === 1 && validarPaso1()) irPaso(2);
        else if (paso === 2 && validarPaso2()) irPaso(3);
    }

    // ---------- Formulario ----------
    function limpiarFormulario() {
        $('comboId').value = '';
        for (const id of ['comboNombre', 'comboPrecio', 'comboDescripcion', 'comboImpuesto', 'comboEstacion', 'comboBuscar']) {
            $(id).value = '';
        }
        fijos.clear();
        elecciones = [];
        limpiarErrores();
        cerrarResultados();
        $('modalComboTitulo').textContent = 'Nuevo combo';
        renderFijos();
        irPaso(1);
    }

    function abrirNuevo() {
        limpiarFormulario();
        getModal()?.show();
    }

    // Un grupo donde hay que escoger TODAS las opciones es, en la práctica, lo que incluye siempre.
    async function abrirEditar(fila) {
        try {
            const c = await GF.api.get(`/combos-armables/${fila.dataset.id}`, 'No se pudo cargar el combo');
            limpiarFormulario();
            $('comboId').value = c.id;
            $('modalComboTitulo').textContent = 'Editar combo';
            $('comboNombre').value = c.nombre;
            $('comboPrecio').value = Number(c.precio_base);
            $('comboDescripcion').value = c.descripcion || '';
            $('comboImpuesto').value = c.tributo || '';
            $('comboEstacion').value = c.estacion_id || '';

            for (const grupo of c.grupos) {
                // Productos que ya no existen o se desactivaron no se pueden mostrar ni quitar: se descartan.
                const g = { ...grupo, opciones: grupo.opciones.filter(o => productoPorId.has(o.producto_id)) };
                if (g.opciones.length === 0) continue;
                if (g.minimo === grupo.maximo && grupo.maximo === grupo.opciones.length) {
                    for (const o of g.opciones) {
                        fijos.set(o.producto_id, (fijos.get(o.producto_id) || 0) + Number(o.cantidad));
                    }
                } else {
                    elecciones.push({
                        nombre: g.nombre,
                        opcional: g.minimo === 0,
                        cuantas: g.maximo,
                        opciones: g.opciones.map(o => ({
                            producto_id: o.producto_id,
                            cantidad: Number(o.cantidad),
                            recargo: Number(o.recargo),
                            es_default: !!o.es_default
                        }))
                    });
                }
            }
            renderFijos();
            getModal()?.show();
        } catch (error) {
            GF.error(error.message);
        }
    }

    // ---------- Guardar / borrar ----------
    function armarGrupos() {
        const grupos = [];
        if (fijos.size > 0) {
            grupos.push({
                nombre: 'Incluye',
                minimo: fijos.size,
                maximo: fijos.size,
                opciones: [...fijos].map(([producto_id, cantidad]) => ({ producto_id, cantidad, recargo: 0, es_default: false }))
            });
        }
        for (const e of elecciones) {
            grupos.push({
                nombre: e.nombre.trim(),
                minimo: e.opcional ? 0 : Number(e.cuantas),
                maximo: Number(e.cuantas),
                opciones: e.opciones.map(o => ({
                    producto_id: Number(o.producto_id),
                    cantidad: Number(o.cantidad) || 1,
                    recargo: Number(o.recargo) || 0,
                    es_default: !!o.es_default
                }))
            });
        }
        return grupos;
    }

    async function guardar() {
        if (!validarPaso3()) return;
        const id = $('comboId').value;
        const payload = {
            nombre: $('comboNombre').value.trim(),
            precio_base: Number($('comboPrecio').value),
            descripcion: $('comboDescripcion').value.trim(),
            tributo: $('comboImpuesto').value || null,
            estacion_id: $('comboEstacion').value ? Number($('comboEstacion').value) : null,
            grupos: armarGrupos()
        };

        const boton = $('btnGuardarCombo');
        GF.cargando(boton, true);
        try {
            await GF.api(
                id ? `/combos-armables/${id}` : '/combos-armables',
                { method: id ? 'PUT' : 'POST', body: payload },
                'No se pudo guardar el combo'
            );
            getModal()?.hide();
            location.reload();
        } catch (error) {
            GF.cargando(boton, false);
            mostrarGeneral(error.message);
        }
    }

    async function borrar(fila) {
        const ok = await GF.confirmar('¿Eliminar este combo? Dejará de ofrecerse; las ventas anteriores no cambian.', {
            confirmar: 'Sí, eliminar'
        });
        if (!ok) return;
        try {
            await GF.api.delete(`/combos-armables/${fila.dataset.id}`, 'No se pudo eliminar');
            location.reload();
        } catch (error) {
            GF.error(error.message);
        }
    }

    // ---------- Eventos ----------
    function onCantidadFija(input) {
        const id = Number(input.closest('[data-id]').dataset.id);
        const valor = Number(input.value);
        fijos.set(id, valor > 0 ? valor : 0);
        // Solo se refresca el subtotal y el resumen: re-renderizar la fila le quitaría el foco al input.
        const sub = input.closest('[data-id]').querySelector('.combo-fila-subtotal');
        if (sub) sub.textContent = GF.dinero((productoPorId.get(id)?.precio || 0) * (valor > 0 ? valor : 0));
        actualizarResumen();
    }

    function onCampoEleccion(el, esChange) {
        const campo = el.dataset.campo;
        const tarjeta = el.closest('[data-e]');
        if (!campo || !tarjeta) return;
        const e = elecciones[Number(tarjeta.dataset.e)];
        const filaOpcion = el.closest('[data-o]');

        if (filaOpcion) {
            e.opciones[Number(filaOpcion.dataset.o)][campo] = el.value;
        } else if (campo === 'opcional') {
            e.opcional = el.checked;
        } else if (campo === 'cuantas') {
            e.cuantas = el.value;
            if (esChange) {
                ajustarCuantas(e);
                renderElecciones();
                return;
            }
        } else {
            e[campo] = el.value;
        }
        actualizarResumen();
    }

    // Lo que se escribe en "agregar un producto": si coincide con uno del catálogo, se agrega.
    function onAgregarOpcion(input) {
        const p = productoPorEtiqueta.get(input.value.trim());
        if (!p) return;
        input.value = '';
        agregarOpcion(Number(input.closest('[data-e]').dataset.e), p);
    }

    function onAccionEleccion(boton) {
        const accion = boton.dataset.accion;
        const tarjeta = boton.closest('[data-e]');
        const i = tarjeta ? Number(tarjeta.dataset.e) : -1;
        if (accion === 'quitar-eleccion') {
            elecciones.splice(i, 1);
        } else if (accion === 'quitar-opcion') {
            elecciones[i].opciones.splice(Number(boton.closest('[data-o]').dataset.o), 1);
            ajustarCuantas(elecciones[i]);
        } else {
            return;
        }
        renderElecciones();
    }

    document.addEventListener('DOMContentLoaded', function () {
        $('comboProductosLista').innerHTML = productos
            .map(p => `<option value="${GF.escapeHtml(etiqueta(p))}"></option>`)
            .join('');

        $('btnNuevoCombo')?.addEventListener('click', abrirNuevo);
        $('btnNuevoComboVacio')?.addEventListener('click', abrirNuevo);
        $('btnComboSiguiente')?.addEventListener('click', siguiente);
        $('btnComboAtras')?.addEventListener('click', () => irPaso(paso - 1));
        $('btnGuardarCombo')?.addEventListener('click', guardar);
        $('btnAgregarEleccion')?.addEventListener('click', () => agregarEleccion());

        $('comboPrecio')?.addEventListener('input', () => {
            marcarError('comboPrecio', 'errComboPrecio', '');
            actualizarResumen();
        });
        $('comboNombre')?.addEventListener('input', () => marcarError('comboNombre', 'errComboNombre', ''));
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

        // Buscador del paso 1: aparece al enfocar/escribir; Enter agrega el resaltado; flechas navegan; Esc cierra.
        const buscar = $('comboBuscar');
        buscar?.addEventListener('focus', () => {
            resultadoActivo = 0;
            renderResultados();
        });
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
            if (boton.dataset.accion === 'quitar') {
                fijos.delete(id);
            } else {
                const actual = fijos.get(id) || 0;
                // − nunca baja de 1: para sacar el producto está el tacho
                fijos.set(id, boton.dataset.accion === 'mas' ? actual + 1 : Math.max(1, actual - 1));
            }
            renderFijos();
        });
        lista?.addEventListener('input', event => {
            if (event.target.matches('.combo-cantidad-input')) onCantidadFija(event.target);
        });

        // Paso 2 (delegación): campos, acciones y agregar productos a una elección.
        const cont = $('comboElecciones');
        cont?.addEventListener('input', event => {
            if (event.target.matches('[data-agregar-opcion]')) onAgregarOpcion(event.target);
            else onCampoEleccion(event.target, false);
        });
        cont?.addEventListener('change', event => {
            if (event.target.matches('[data-agregar-opcion]')) onAgregarOpcion(event.target);
            else onCampoEleccion(event.target, true);
        });
        cont?.addEventListener('click', event => {
            const boton = event.target.closest('[data-accion]');
            if (boton) onAccionEleccion(boton);
        });
        document.querySelectorAll('[data-atajo]').forEach(boton => {
            boton.addEventListener('click', () => agregarEleccion(ATAJOS[boton.dataset.atajo]));
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
