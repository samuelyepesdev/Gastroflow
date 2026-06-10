const base = '/recetas';
let insumosList = [];

async function loadProductos() {
    const r = await fetch(base + '/api/productos', { credentials: 'same-origin' });
    const data = await r.json();
    const sel = document.getElementById('recetaProductoId');
    sel.innerHTML = '<option value="">-- Seleccionar producto --</option>' + (data || []).map(p => `<option value="${p.id}">${p.nombre} (${p.codigo || ''})</option>`).join('');
}
async function loadInsumos() {
    const r = await fetch(base + '/api/insumos', { credentials: 'same-origin' });
    insumosList = await r.json();
}
function addIngredienteRow(insumoId, cantidad, unidad) {
    insumoId = insumoId || '';
    cantidad = cantidad || '';
    unidad = unidad || 'g';
    const tbody = document.getElementById('recetaIngredientesContainer');
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><select class="form-select form-select-sm insumo-select">${insumosList.map(i => `<option value="${i.id}" ${i.id == insumoId ? 'selected' : ''}>${i.nombre} (${i.unidad_base || 'g'})</option>`).join('')}</select></td>
        <td><input type="number" step="0.0001" class="form-control form-control-sm cantidad-input" placeholder="Cantidad" value="${cantidad}"></td>
        <td><input type="text" class="form-control form-control-sm unidad-input" placeholder="g" value="${unidad}"></td>
        <td><button type="button" class="btn btn-sm btn-outline-danger quitar-ing" title="Quitar"><i class="bi bi-trash"></i></button></td>
    `;
    tr.querySelector('.quitar-ing').onclick = () => tr.remove();
    tbody.appendChild(tr);
}
document.getElementById('btnAgregarIngrediente').addEventListener('click', () => addIngredienteRow());

document.getElementById('btnGuardarReceta').addEventListener('click', async () => {
    const id = document.getElementById('recetaId').value;
    const producto_id = document.getElementById('recetaProductoId').value;
    const nombre_receta = document.getElementById('recetaNombre').value.trim();
    const porciones = parseFloat(document.getElementById('recetaPorciones').value) || 1;
    const rows = document.querySelectorAll('#recetaIngredientesContainer tr');
    const ingredientes = [];
    rows.forEach(row => {
        const insumoId = row.querySelector('.insumo-select').value;
        const cantidad = row.querySelector('.cantidad-input').value;
        if (insumoId && cantidad) ingredientes.push({ insumo_id: parseInt(insumoId, 10), cantidad: parseFloat(cantidad), unidad: row.querySelector('.unidad-input').value || 'g' });
    });
    if (!producto_id || !nombre_receta) {
        Swal.fire({ icon: 'warning', title: 'Campos requeridos', text: 'Debes seleccionar un producto y escribir el nombre de la receta.', timer: 2500, showConfirmButton: false });
        return;
    }
    const payload = { producto_id: parseInt(producto_id, 10), nombre_receta, porciones, ingredientes };
    const url = id ? base + '/api/recetas/' + id : base + '/api/recetas';
    const method = id ? 'PUT' : 'POST';
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(id ? { nombre_receta, porciones, ingredientes } : payload), credentials: 'same-origin' });
    if (r.ok) { bootstrap.Modal.getInstance(document.getElementById('modalReceta')).hide(); location.reload(); } else { const e = await r.json(); Swal.fire({ icon: 'error', title: 'Error', text: e.error || 'No se pudo guardar la receta' }); }
});

document.getElementById('modalReceta').addEventListener('show.bs.modal', async (e) => {
    var trigger = e.relatedTarget;
    var abrioNueva = trigger && (trigger.id === 'btnNuevaReceta' || (trigger.closest && trigger.closest('#btnNuevaReceta')));
    var id = document.getElementById('recetaId').value;
    if (abrioNueva || !id) {
        document.getElementById('recetaId').value = '';
        document.getElementById('recetaProductoId').value = '';
        document.getElementById('recetaProductoId').disabled = false;
        document.getElementById('recetaNombre').value = '';
        document.getElementById('recetaPorciones').value = '1';
        document.getElementById('recetaIngredientesContainer').innerHTML = '';
        document.getElementById('modalRecetaTitulo').textContent = 'Nueva receta';
        await loadProductos();
        await loadInsumos();
        addIngredienteRow();
    }
});

async function editarReceta(recetaId) {
    const r = await fetch(base + '/api/recetas/' + recetaId, { credentials: 'same-origin' });
    const rec = await r.json();
    if (!rec) return;
    document.getElementById('recetaId').value = rec.id;
    document.getElementById('modalRecetaTitulo').textContent = 'Editar receta';
    await loadProductos();
    await loadInsumos();
    document.getElementById('recetaProductoId').value = rec.producto_id;
    document.getElementById('recetaProductoId').disabled = true;
    document.getElementById('recetaNombre').value = rec.nombre_receta || '';
    document.getElementById('recetaPorciones').value = rec.porciones || 1;
    document.getElementById('recetaIngredientesContainer').innerHTML = '';
    (rec.ingredientes || []).forEach(ing => addIngredienteRow(ing.insumo_id, ing.cantidad, ing.unidad || 'g'));
    new bootstrap.Modal(document.getElementById('modalReceta')).show();
}

function eliminarReceta(idOrBtn, nombre) {
    var id, nom;
    if (typeof idOrBtn === 'object' && idOrBtn && idOrBtn.getAttribute) {
        id = idOrBtn.getAttribute('data-id');
        nom = (idOrBtn.getAttribute('data-nombre') || '').replace(/&quot;/g, '"');
    } else {
        id = idOrBtn;
        nom = nombre || '';
    }
    if (!confirm('¿Eliminar la receta "' + nom + '"?')) return;
    fetch(base + '/api/recetas/' + id, { method: 'DELETE', credentials: 'same-origin' }).then(r => { if (r.ok) location.reload(); else r.json().then(e => alert(e.error)); });
}

document.addEventListener('click', function (e) {
    var btn = e.target.closest('.btn-eliminar-receta');
    if (btn) { e.preventDefault(); eliminarReceta(btn); }
});

(function () {
    const input = document.getElementById('buscarReceta');
    if (!input) return;
    input.addEventListener('input', () => {
        const term = input.value.trim().toLowerCase();
        document.querySelectorAll('#tbodyRecetas .fila-receta').forEach(row => {
            const prod = (row.querySelector('[data-field="producto"]')?.innerText || '').toLowerCase();
            const nom = (row.querySelector('[data-field="nombre"]')?.innerText || '').toLowerCase();
            const match = !term || prod.includes(term) || nom.includes(term);
            row.style.display = match ? '' : 'none';
        });
        document.querySelectorAll('#listaRecetasMobile .receta-card-item').forEach(card => {
            const prod = (card.getAttribute('data-producto') || '').toLowerCase();
            const nom = (card.getAttribute('data-nombre') || '').toLowerCase();
            const match = !term || prod.includes(term) || nom.includes(term);
            card.style.display = match ? '' : 'none';
        });
    });
})();
