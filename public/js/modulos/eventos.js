(function () {
    const modal = document.getElementById('modalEvento');
    const title = document.getElementById('modalEventoTitle');
    const idInp = document.getElementById('eventoId');
    const nombreInp = document.getElementById('eventoNombre');
    const fechaInicio = document.getElementById('eventoFechaInicio');
    const fechaFin = document.getElementById('eventoFechaFin');
    const descInp = document.getElementById('eventoDescripcion');
    const tipoInp = document.getElementById('eventoTipo');
    const activoInp = document.getElementById('eventoActivo');
    const wrapActivo = document.getElementById('wrapActivo');

    document.getElementById('btnNuevoEvento') && document.getElementById('btnNuevoEvento').addEventListener('click', function () {
        idInp.value = '';
        title.innerHTML = '<i class="bi bi-calendar-plus me-2"></i>Nuevo evento';
        nombreInp.value = '';
        fechaInicio.value = '';
        fechaFin.value = '';
        descInp.value = '';
        tipoInp.value = 'permanente';
        activoInp.checked = true;
        wrapActivo.style.display = '';
    });

    window.editarEvento = function ({ id, nombre, fIni, fFin, desc, activo, tipo }) {
        idInp.value = id;
        title.innerHTML = '<i class="bi bi-pencil me-2"></i>Editar evento';
        nombreInp.value = nombre || '';
        fechaInicio.value = fIni || '';
        fechaFin.value = fFin || '';
        descInp.value = desc || '';
        tipoInp.value = (tipo === 'ocasional' ? 'ocasional' : 'permanente');
        activoInp.checked = !!activo;
        wrapActivo.style.display = '';
        new bootstrap.Modal(modal).show();
    };

    // Extraída para no anidar un .then() dentro de otro .then() (SonarQube S2004).
    async function parseJsonResponse(res) {
        const data = await res.json();
        return { ok: res.ok, data };
    }

    window.eliminarEvento = async function (id, nombre) {
        const r = await Swal.fire({
            title: '¿Eliminar evento?',
            text: nombre ? 'Se eliminará "' + nombre + '". Las facturas ya asociadas quedarán sin evento.' : '',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar'
        });
        if (!r.isConfirmed) return;

        try {
            const res = await fetch('/eventos/' + id, { method: 'DELETE', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } });
            const { ok, data } = await parseJsonResponse(res);
            if (ok) {
                Swal.fire({ icon: 'success', title: 'Evento eliminado' });
                window.location.reload();
            } else {
                Swal.fire({ icon: 'error', title: data.error || 'Error' });
            }
        } catch (err) {
            console.error('Error al eliminar evento:', err);
            Swal.fire({ icon: 'error', title: 'Error de conexión' });
        }
    };

    document.getElementById('btnGuardarEvento').addEventListener('click', async function () {
        const id = idInp.value;
        const payload = {
            nombre: nombreInp.value.trim(),
            fecha_inicio: fechaInicio.value,
            fecha_fin: fechaFin.value,
            descripcion: descInp.value.trim() || null,
            tipo: tipoInp.value || 'permanente',
            activo: activoInp.checked
        };
        if (!payload.nombre || !payload.fecha_inicio || !payload.fecha_fin) {
            Swal.fire({ icon: 'warning', title: 'Completa nombre, fecha inicio y fecha fin.' });
            return;
        }
        const url = id ? '/eventos/' + id : '/eventos';
        const method = id ? 'PUT' : 'POST';

        let result;
        try {
            const res = await fetch(url, { method: method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(payload) });
            const ct = res.headers.get('content-type');
            result = ct && ct.includes('json')
                ? await parseJsonResponse(res)
                : { ok: false, data: { error: 'Respuesta no válida del servidor' } };
        } catch (err) {
            console.error('Error al guardar evento:', err);
            const modalInstance = bootstrap.Modal.getInstance(modal);
            if (modalInstance) modalInstance.hide();
            setTimeout(function () { Swal.fire({ icon: 'error', title: 'Error de conexión' }); }, 150);
            return;
        }

        const modalInstance = bootstrap.Modal.getInstance(modal);
        if (modalInstance) modalInstance.hide();
        if (result.ok) {
            setTimeout(async function () {
                await Swal.fire({ icon: 'success', title: id ? 'Evento actualizado' : 'Evento creado' });
                window.location.reload();
            }, 150);
        } else {
            setTimeout(function () { Swal.fire({ icon: 'error', title: result.data.error || 'Error' }); }, 150);
        }
    });
})();
