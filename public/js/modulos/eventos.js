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

    window.editarEvento = function (id, nombre, fIni, fFin, desc, activo, tipo) {
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

    window.eliminarEvento = function (id, nombre) {
        Swal.fire({
            title: '¿Eliminar evento?',
            text: nombre ? 'Se eliminará "' + nombre + '". Las facturas ya asociadas quedarán sin evento.' : '',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar'
        }).then(function (r) {
            if (!r.isConfirmed) return;
            fetch('/eventos/' + id, { method: 'DELETE', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } })
                .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data }; }); })
                .then(function (o) {
                    if (o.ok) { Swal.fire({ icon: 'success', title: 'Evento eliminado' }); window.location.reload(); }
                    else Swal.fire({ icon: 'error', title: o.data.error || 'Error' });
                })
                .catch(function () { Swal.fire({ icon: 'error', title: 'Error de conexión' }); });
        });
    };

    document.getElementById('btnGuardarEvento').addEventListener('click', function () {
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
        fetch(url, { method: method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(payload) })
            .then(function (res) {
                const ct = res.headers.get('content-type');
                if (ct && ct.indexOf('json') !== -1) return res.json().then(function (data) { return { ok: res.ok, data }; });
                return { ok: false, data: { error: 'Respuesta no válida del servidor' } };
            })
            .then(function (o) {
                const modalInstance = bootstrap.Modal.getInstance(modal);
                if (modalInstance) modalInstance.hide();
                if (o.ok) {
                    setTimeout(function () {
                        Swal.fire({ icon: 'success', title: id ? 'Evento actualizado' : 'Evento creado' }).then(function () { window.location.reload(); });
                    }, 150);
                } else {
                    setTimeout(function () { Swal.fire({ icon: 'error', title: o.data.error || 'Error' }); }, 150);
                }
            })
            .catch(function () {
                const modalInstance = bootstrap.Modal.getInstance(modal);
                if (modalInstance) modalInstance.hide();
                setTimeout(function () { Swal.fire({ icon: 'error', title: 'Error de conexión' }); }, 150);
            });
    });
})();
