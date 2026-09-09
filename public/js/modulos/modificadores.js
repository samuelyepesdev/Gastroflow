const base = '/modificadores';

// Lista de insumos del tenant, para el selector cuando el grupo descuenta inventario.
const INSUMOS = (function () {
    const el = document.getElementById('modificadores-insumos-data');
    try {
        return el ? JSON.parse(el.textContent) : [];
    } catch (_) {
        return [];
    }
})();
const INSUMOS_POR_ID = new Map(INSUMOS.map(i => [String(i.id), i]));

function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildInsumoOptions(selectedId) {
    const sel = selectedId != null ? String(selectedId) : '';
    const opts = ['<option value="">— Sin insumo —</option>'];
    INSUMOS.forEach(i => {
        const s = String(i.id) === sel ? ' selected' : '';
        opts.push(`<option value="${i.id}"${s}>${escapeHtml(i.nombre)}</option>`);
    });
    return opts.join('');
}

function inventarioActivo() {
    return !!document.getElementById('grupoDescuentaInventario')?.checked;
}

// Muestra/oculta las columnas de insumo/cantidad según el check del grupo.
function toggleInventarioCols(on) {
    document
        .querySelectorAll('#grupoOpcionesTabla .col-inventario')
        .forEach(el => el.classList.toggle('d-none', !on));
}

// Plantillas rápidas: para no empezar de cero, el usuario elige una y ajusta
// nombres/precios a su gusto antes de guardar.
const PLANTILLAS = {
    salsas: {
        nombre: 'Elige tu salsa',
        tipo_seleccion: 'unica',
        obligatorio: false,
        opciones: [
            { nombre: 'BBQ', precio_adicional: 0 },
            { nombre: 'Piña', precio_adicional: 0 },
            { nombre: 'Miel mostaza', precio_adicional: 0 },
            { nombre: 'Picante', precio_adicional: 0 }
        ]
    },
    tamanos: {
        nombre: 'Elige el tamaño',
        tipo_seleccion: 'unica',
        obligatorio: true,
        opciones: [
            { nombre: 'Pequeño', precio_adicional: 0 },
            { nombre: 'Mediano', precio_adicional: 2000 },
            { nombre: 'Grande', precio_adicional: 4000 }
        ]
    },
    extras: {
        nombre: 'Toppings extra',
        tipo_seleccion: 'multiple',
        obligatorio: false,
        opciones: [
            { nombre: 'Queso extra', precio_adicional: 2000 },
            { nombre: 'Tocineta', precio_adicional: 3000 },
            { nombre: 'Guacamole', precio_adicional: 2500 },
            { nombre: 'Champiñones', precio_adicional: 2000 }
        ]
    },
    picante: {
        nombre: 'Nivel de picante',
        tipo_seleccion: 'unica',
        obligatorio: false,
        opciones: [
            { nombre: 'Suave', precio_adicional: 0 },
            { nombre: 'Medio', precio_adicional: 0 },
            { nombre: 'Picante', precio_adicional: 0 },
            { nombre: 'Extra picante', precio_adicional: 0 }
        ]
    }
};

function addOpcionRow(nombre = '', precioAdicional = '', insumoId = null, cantidadInsumo = null, unidadInsumo = null) {
    const tbody = document.getElementById('grupoOpcionesContainer');
    const hidden = inventarioActivo() ? '' : ' d-none';
    const insumo = insumoId != null ? INSUMOS_POR_ID.get(String(insumoId)) : null;
    const unidad = unidadInsumo || (insumo ? insumo.unidad_base : '');
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><input type="text" class="form-control form-control-sm opcion-nombre-input" placeholder="Ej: Queso extra" value="${escapeHtml(nombre)}"></td>
        <td><input type="text" inputmode="decimal" class="form-control form-control-sm opcion-precio-input money-input" placeholder="0" value="${MoneyInput.format(String(Math.round(Number(precioAdicional) || 0)))}"></td>
        <td class="col-inventario${hidden}">
            <select class="form-select form-select-sm opcion-insumo-input">${buildInsumoOptions(insumoId)}</select>
        </td>
        <td class="col-inventario${hidden}">
            <div class="input-group input-group-sm">
                <input type="number" step="0.0001" min="0" class="form-control opcion-cantidad-input" placeholder="0" value="${cantidadInsumo ?? ''}">
                <span class="input-group-text opcion-unidad-label">${escapeHtml(unidad || '—')}</span>
            </div>
        </td>
        <td><button type="button" class="btn btn-sm btn-outline-danger quitar-opcion" title="Quitar"><i class="bi bi-trash"></i></button></td>
    `;
    // Fila creada después del DOMContentLoaded inicial: money-input.js no la
    // detectó automáticamente, hay que engancharla a mano.
    MoneyInput.attach(tr.querySelector('.opcion-precio-input'));

    // Al elegir insumo, la unidad de la cantidad es la unidad base de ese insumo.
    const selInsumo = tr.querySelector('.opcion-insumo-input');
    const lblUnidad = tr.querySelector('.opcion-unidad-label');
    selInsumo.addEventListener('change', () => {
        const it = INSUMOS_POR_ID.get(selInsumo.value);
        lblUnidad.textContent = it ? it.unidad_base : '—';
    });

    tr.querySelector('.quitar-opcion').onclick = () => tr.remove();
    tbody.appendChild(tr);
}
document.getElementById('btnAgregarOpcion').addEventListener('click', () => addOpcionRow());

document.getElementById('grupoDescuentaInventario').addEventListener('change', function () {
    toggleInventarioCols(this.checked);
});

function setTipoSeleccion(valor) {
    document.getElementById('grupoTipoSeleccion').value = valor;
    document.querySelectorAll('.grupo-seleccion-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.valor === valor);
    });
    const esMultiple = valor === 'multiple';
    document.getElementById('grupoAvanzadoTrigger').style.display = esMultiple ? '' : 'none';
    if (!esMultiple) {
        document.getElementById('grupoMinimo').value = '0';
        document.getElementById('grupoMaximo').value = '';
    }
}
document.querySelectorAll('.grupo-seleccion-btn').forEach(btn => {
    btn.addEventListener('click', () => setTipoSeleccion(btn.dataset.valor));
});

function aplicarPlantilla(clave) {
    const plantilla = PLANTILLAS[clave];
    if (!plantilla) return;
    document.getElementById('grupoNombre').value = plantilla.nombre;
    setTipoSeleccion(plantilla.tipo_seleccion);
    document.getElementById('grupoObligatorio').checked = plantilla.obligatorio;
    document.getElementById('grupoOpcionesContainer').innerHTML = '';
    plantilla.opciones.forEach(o => addOpcionRow(o.nombre, o.precio_adicional));
}
document.querySelectorAll('.btn-plantilla').forEach(btn => {
    btn.addEventListener('click', () => aplicarPlantilla(btn.dataset.plantilla));
});

document.getElementById('btnGuardarGrupo').addEventListener('click', async () => {
    const id = document.getElementById('grupoId').value;
    const nombre = document.getElementById('grupoNombre').value.trim();
    const tipo_seleccion = document.getElementById('grupoTipoSeleccion').value;
    const obligatorio = document.getElementById('grupoObligatorio').checked;
    const minimo_selecciones = Number.parseInt(document.getElementById('grupoMinimo').value, 10) || 0;
    const maximoRaw = document.getElementById('grupoMaximo').value;
    const maximo_selecciones = maximoRaw ? Number.parseInt(maximoRaw, 10) : null;

    const descuenta_inventario = inventarioActivo();
    const rows = document.querySelectorAll('#grupoOpcionesContainer tr');
    const opciones = [];
    let faltaInsumo = false;
    rows.forEach(row => {
        const opcionNombre = row.querySelector('.opcion-nombre-input').value.trim();
        if (!opcionNombre) return;

        let insumoId = null;
        let cantidadInsumo = null;
        let unidadInsumo = null;
        if (descuenta_inventario) {
            const selVal = row.querySelector('.opcion-insumo-input').value;
            const cantVal = Number.parseFloat(row.querySelector('.opcion-cantidad-input').value);
            if (selVal && cantVal > 0) {
                insumoId = Number.parseInt(selVal, 10);
                cantidadInsumo = cantVal;
                unidadInsumo = (INSUMOS_POR_ID.get(selVal) || {}).unidad_base || null;
            } else {
                faltaInsumo = true;
            }
        }

        opciones.push({
            nombre: opcionNombre,
            precio_adicional: MoneyInput.parse(row.querySelector('.opcion-precio-input').value),
            insumo_id: insumoId,
            cantidad_insumo: cantidadInsumo,
            unidad_insumo: unidadInsumo
        });
    });

    if (!nombre) {
        Swal.fire({ icon: 'warning', title: 'Campo requerido', text: 'El nombre del grupo es obligatorio.', timer: 2500, showConfirmButton: false });
        return;
    }
    if (opciones.length === 0) {
        Swal.fire({ icon: 'warning', title: 'Agrega al menos una opción', text: 'Ej: si es "Elige tu salsa", agrega BBQ, Piña, etc.', timer: 3000, showConfirmButton: false });
        return;
    }
    if (descuenta_inventario && faltaInsumo) {
        Swal.fire({
            icon: 'warning',
            title: 'Faltan datos de inventario',
            text: 'Este grupo descuenta inventario: cada opción necesita un insumo y una cantidad mayor a 0. Corrige las opciones marcadas o desactiva "Descontar del inventario".',
            confirmButtonColor: '#d33'
        });
        return;
    }

    const payload = { nombre, tipo_seleccion, obligatorio, descuenta_inventario, minimo_selecciones, maximo_selecciones, opciones };
    const url = id ? base + '/api/grupos/' + id : base + '/api/grupos';
    const method = id ? 'PUT' : 'POST';
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), credentials: 'same-origin' });
    if (r.ok) { bootstrap.Modal.getInstance(document.getElementById('modalGrupo')).hide(); location.reload(); } else { const e = await r.json(); Swal.fire({ icon: 'error', title: 'Error', text: e.error || 'No se pudo guardar el grupo' }); }
});

document.getElementById('modalGrupo').addEventListener('show.bs.modal', (e) => {
    const trigger = e.relatedTarget;
    const abrioNuevo = trigger?.id === 'btnNuevoGrupo' || trigger?.closest?.('#btnNuevoGrupo');
    const id = document.getElementById('grupoId').value;
    if (abrioNuevo || !id) {
        document.getElementById('grupoId').value = '';
        document.getElementById('grupoNombre').value = '';
        setTipoSeleccion('unica');
        document.getElementById('grupoObligatorio').checked = false;
        document.getElementById('grupoDescuentaInventario').checked = false;
        toggleInventarioCols(false);
        document.getElementById('grupoMinimo').value = '0';
        document.getElementById('grupoMaximo').value = '';
        document.getElementById('grupoOpcionesContainer').innerHTML = '';
        document.getElementById('modalGrupoTitulo').textContent = 'Nuevo grupo de toppings';
        document.getElementById('grupoPlantillasWrap').style.display = '';
        addOpcionRow();
    }
});

async function editarGrupo(grupoId) {
    const r = await fetch(base + '/api/grupos/' + grupoId, { credentials: 'same-origin' });
    const g = await r.json();
    if (!g) return;
    document.getElementById('grupoId').value = g.id;
    document.getElementById('modalGrupoTitulo').textContent = 'Editar grupo de toppings';
    document.getElementById('grupoPlantillasWrap').style.display = 'none';
    document.getElementById('grupoNombre').value = g.nombre || '';
    setTipoSeleccion(g.tipo_seleccion || 'unica');
    document.getElementById('grupoObligatorio').checked = !!g.obligatorio;
    document.getElementById('grupoDescuentaInventario').checked = !!g.descuenta_inventario;
    toggleInventarioCols(!!g.descuenta_inventario);
    document.getElementById('grupoMinimo').value = g.minimo_selecciones || 0;
    document.getElementById('grupoMaximo').value = g.maximo_selecciones ?? '';
    document.getElementById('grupoOpcionesContainer').innerHTML = '';
    (g.opciones || []).forEach(o => addOpcionRow(o.nombre, o.precio_adicional, o.insumo_id, o.cantidad_insumo, o.unidad_insumo));
    if (!g.opciones || g.opciones.length === 0) addOpcionRow();
    new bootstrap.Modal(document.getElementById('modalGrupo')).show();
}

function eliminarGrupo(idOrBtn, nombre) {
    let id, nom;
    if (typeof idOrBtn === 'object' && idOrBtn && idOrBtn.getAttribute) {
        id = idOrBtn.dataset.id;
        nom = (idOrBtn.dataset.nombre || '').replaceAll('&quot;', '"');
    } else {
        id = idOrBtn;
        nom = nombre || '';
    }
    if (!confirm('¿Eliminar el grupo "' + nom + '"? Se quitará de todos los productos que lo tengan asignado.')) return;
    fetch(base + '/api/grupos/' + id, { method: 'DELETE', credentials: 'same-origin' }).then(r => { if (r.ok) location.reload(); else r.json().then(e => alert(e.error)); });
}

document.addEventListener('click', function (e) {
    const btnEliminar = e.target.closest('.btn-eliminar-grupo');
    if (btnEliminar) {
        e.preventDefault();
        eliminarGrupo(btnEliminar);
        return;
    }
    const btnEditar = e.target.closest('.btn-editar-grupo');
    if (btnEditar) {
        e.preventDefault();
        const id = btnEditar.dataset.id;
        editarGrupo(id);
    }
});

(function () {
    const input = document.getElementById('buscarGrupo');
    if (!input) return;
    input.addEventListener('input', () => {
        const term = input.value.trim().toLowerCase();
        document.querySelectorAll('#tbodyGrupos .fila-grupo').forEach(row => {
            const nom = (row.querySelector('[data-field="nombre"]')?.innerText || '').toLowerCase();
            row.style.display = (!term || nom.includes(term)) ? '' : 'none';
        });
        document.querySelectorAll('#listaGruposMobile .grupo-card-item').forEach(card => {
            const nom = (card.dataset.nombre || '').toLowerCase();
            card.style.display = (!term || nom.includes(term)) ? '' : 'none';
        });
    });
})();
