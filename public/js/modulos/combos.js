// CRUD de combos fijos (producto a precio fijo + lista de productos componentes).
// Sin onclick inline (delegación de eventos).

(function () {
    function getModal() {
        const el = document.getElementById('modalCombo');
        return el ? bootstrap.Modal.getOrCreateInstance(el) : null;
    }

    function agregarComponente(productoId, cantidad) {
        const fila = document.getElementById('tplComponente').content.firstElementChild.cloneNode(true);
        if (productoId) fila.querySelector('.combo-componente-producto').value = String(productoId);
        if (cantidad) fila.querySelector('.combo-componente-cantidad').value = cantidad;
        document.getElementById('comboComponentes').appendChild(fila);
        actualizarResumen();
    }

    // Muestra la suma de precios individuales vs. el precio del combo (el ahorro del cliente).
    function actualizarResumen() {
        let suma = 0;
        document.querySelectorAll('.combo-componente').forEach(fila => {
            const opt = fila.querySelector('.combo-componente-producto').selectedOptions[0];
            const cantidad = Number(fila.querySelector('.combo-componente-cantidad').value) || 0;
            suma += (Number(opt?.dataset.precio) || 0) * cantidad;
        });
        const precio = Number(document.getElementById('comboPrecio').value) || 0;
        const resumen = document.getElementById('comboResumenPrecio');
        if (suma <= 0) {
            resumen.textContent = '';
            return;
        }
        let texto = `Por separado: ${GF.dinero(suma)}`;
        if (precio > 0) {
            texto += ` · el cliente ${precio <= suma ? 'ahorra' : 'paga de más'} ${GF.dinero(Math.abs(suma - precio))}`;
        }
        resumen.textContent = texto;
    }

    function limpiarFormulario() {
        document.getElementById('comboId').value = '';
        document.getElementById('comboNombre').value = '';
        document.getElementById('comboPrecio').value = '';
        document.getElementById('comboCategoria').value = '';
        document.getElementById('comboComponentes').innerHTML = '';
        document.getElementById('modalComboTitulo').textContent = 'Nuevo combo';
        actualizarResumen();
    }

    function abrirNuevo() {
        limpiarFormulario();
        agregarComponente();
        getModal()?.show();
    }

    async function abrirEditar(fila) {
        try {
            const c = await GF.api(`/combos/${fila.dataset.id}`, {}, 'No se pudo cargar el combo');
            limpiarFormulario();
            document.getElementById('comboId').value = c.id;
            document.getElementById('comboNombre').value = c.nombre;
            document.getElementById('comboPrecio').value = Number(c.precio_unidad);
            document.getElementById('comboCategoria').value = c.categoria_id || '';
            (c.componentes || []).forEach(comp => agregarComponente(comp.producto_id, Number(comp.cantidad)));
            document.getElementById('modalComboTitulo').textContent = 'Editar combo';
            actualizarResumen();
            getModal()?.show();
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        }
    }

    async function guardar() {
        const id = document.getElementById('comboId').value;
        const componentes = Array.from(document.querySelectorAll('.combo-componente'))
            .map(fila => ({
                producto_id: Number(fila.querySelector('.combo-componente-producto').value),
                cantidad: Number(fila.querySelector('.combo-componente-cantidad').value)
            }))
            .filter(c => c.producto_id);

        const payload = {
            nombre: document.getElementById('comboNombre').value.trim(),
            precio_unidad: Number(document.getElementById('comboPrecio').value),
            categoria_id: Number(document.getElementById('comboCategoria').value) || null,
            componentes
        };

        try {
            await GF.api(
                id ? `/combos/${id}` : '/combos',
                { method: id ? 'PUT' : 'POST', body: payload },
                'No se pudo guardar el combo'
            );
            getModal()?.hide();
            location.reload();
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        }
    }

    async function borrar(fila) {
        const result = await Swal.fire({
            title: '¿Eliminar este combo?',
            text: 'Dejará de venderse de inmediato. Las ventas anteriores no cambian.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            confirmButtonText: 'Sí, eliminar'
        });
        if (!result.isConfirmed) return;

        try {
            await GF.api(`/combos/${fila.dataset.id}`, { method: 'DELETE' }, 'No se pudo eliminar');
            location.reload();
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        document.getElementById('btnNuevoCombo')?.addEventListener('click', abrirNuevo);
        document.getElementById('btnGuardarCombo')?.addEventListener('click', guardar);
        document.getElementById('btnAgregarComponente')?.addEventListener('click', () => agregarComponente());
        document.getElementById('comboPrecio')?.addEventListener('input', actualizarResumen);

        const lista = document.getElementById('comboComponentes');
        lista?.addEventListener('change', actualizarResumen);
        lista?.addEventListener('input', actualizarResumen);
        lista?.addEventListener('click', function (event) {
            if (event.target.closest('.combo-componente-quitar')) {
                event.target.closest('.combo-componente').remove();
                actualizarResumen();
            }
        });

        document.getElementById('combosTbody')?.addEventListener('click', function (event) {
            const fila = event.target.closest('tr[data-id]');
            if (!fila) return;
            if (event.target.closest('.btn-editar-combo')) abrirEditar(fila);
            else if (event.target.closest('.btn-borrar-combo')) borrar(fila);
        });
    });
})();
