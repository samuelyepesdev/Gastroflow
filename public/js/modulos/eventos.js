(function () {
    const modal = document.getElementById('modalEvento');
    const title = document.getElementById('modalEventoTitle');
    const idInp = document.getElementById('eventoId');
    const nombreInp = document.getElementById('eventoNombre');
    const fechaInicio = document.getElementById('eventoFechaInicio');
    const fechaFin = document.getElementById('eventoFechaFin');
    const descInp = document.getElementById('eventoDescripcion');
    const incluirInp = document.getElementById('eventoIncluirVentas');
    const activoInp = document.getElementById('eventoActivo');
    const wrapActivo = document.getElementById('wrapActivo');

    document.getElementById('btnNuevoEvento') && document.getElementById('btnNuevoEvento').addEventListener('click', function () {
        idInp.value = '';
        title.innerHTML = '<i class="bi bi-calendar-plus me-2"></i>Nuevo evento';
        nombreInp.value = '';
        const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
        fechaInicio.value = hoy;
        fechaFin.value = hoy;
        descInp.value = '';
        incluirInp.checked = false;
        activoInp.checked = true;
        wrapActivo.style.display = '';
    });

    function editarEvento({ id, nombre, fIni, fFin, desc, activo, incluir }) {
        idInp.value = id;
        title.innerHTML = '<i class="bi bi-pencil me-2"></i>Editar evento';
        nombreInp.value = nombre || '';
        fechaInicio.value = fIni || '';
        fechaFin.value = fFin || '';
        descInp.value = desc || '';
        incluirInp.checked = !!incluir;
        activoInp.checked = !!activo;
        wrapActivo.style.display = '';
        new bootstrap.Modal(modal).show();
    }

    async function eliminarEvento(id, nombre) {
        const r = await Swal.fire({
            title: '¿Eliminar evento?',
            text: nombre ? 'Se eliminará "' + nombre + '". Solo se pueden eliminar eventos sin ventas.' : '',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar'
        });
        if (!r.isConfirmed) return;

        try {
            await GF.api.delete('/eventos/' + id, 'No se pudo eliminar el evento');
            await Swal.fire({ ...GF.marca.swalIcono('exito'), title: 'Evento eliminado', timer: 1400, showConfirmButton: false });
            window.location.reload();
        } catch (err) {
            Swal.fire({ icon: 'error', title: err.message });
        }
    }

    // Los botones de la tabla llevan sus datos en data-* (el HTML ya viene escapado del servidor).
    document.addEventListener('click', function (e) {
        const btn = e.target.closest('[data-accion]');
        if (!btn) return;
        if (btn.dataset.accion === 'editar-evento') {
            editarEvento(JSON.parse(btn.dataset.evento));
        } else if (btn.dataset.accion === 'eliminar-evento') {
            eliminarEvento(btn.dataset.id, btn.dataset.nombre);
        }
    });

    document.getElementById('btnGuardarEvento').addEventListener('click', async function () {
        const id = idInp.value;
        const payload = {
            nombre: nombreInp.value.trim(),
            fecha_inicio: fechaInicio.value,
            fecha_fin: fechaFin.value,
            descripcion: descInp.value.trim() || null,
            incluir_en_ventas: incluirInp.checked,
            activo: activoInp.checked
        };
        if (!payload.nombre || !payload.fecha_inicio || !payload.fecha_fin) {
            Swal.fire({ icon: 'warning', title: 'Completa nombre, fecha inicio y fecha fin.' });
            return;
        }
        if (payload.fecha_fin < payload.fecha_inicio) {
            Swal.fire({ icon: 'warning', title: 'La fecha fin debe ser igual o posterior a la fecha inicio.' });
            return;
        }
        const url = id ? '/eventos/' + id : '/eventos';
        const method = id ? 'PUT' : 'POST';

        // El modal se cierra antes del aviso (y el aviso va con un respiro) para
        // que el backdrop de Bootstrap no quede encima de SweetAlert.
        const cerrarModal = () => {
            const modalInstance = bootstrap.Modal.getInstance(modal);
            if (modalInstance) modalInstance.hide();
        };
        try {
            await GF.api(url, { method, body: payload }, 'No se pudo guardar el evento');
            cerrarModal();
            setTimeout(async function () {
                await Swal.fire({
                    ...GF.marca.swalIcono('exito'),
                    title: id ? 'Evento actualizado' : 'Evento creado',
                    timer: 1600,
                    showConfirmButton: false
                });
                window.location.reload();
            }, 150);
        } catch (err) {
            cerrarModal();
            setTimeout(function () { Swal.fire({ icon: 'error', title: err.message }); }, 150);
        }
    });
})();
