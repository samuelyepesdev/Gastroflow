$(function () {
    const modal = new bootstrap.Modal('#modalServicio');
    const form = $('#formServicio');

    // live search
    $('#buscarServicio').on('keyup', function () {
        const value = $(this).val().toLowerCase();
        $('#tablaServicios tbody .servicio-row').filter(function () {
            $(this).toggle($(this).text().toLowerCase().indexOf(value) > -1);
        });
    });

    // Reset modal on close
    $('#modalServicio').on('hidden.bs.modal', function () {
        form[0].reset();
        form.attr('action', '/servicios');
        $('#modalTitle').text('Nuevo Servicio');
        $('#service_id').val('');
        $('#es_externo').prop('checked', true);
        $('#activo').prop('checked', true);
    });

    // Edit button handler
    $('.btn-edit').on('click', function () {
        const s = $(this).data('servicio');
        $('#modalTitle').text('Editar Servicio');
        form.attr('action', `/servicios/${s.id}/update`);
        $('#service_id').val(s.id);
        $('#nombre').val(s.nombre);
        $('#descripcion').val(s.descripcion);
        $('#precio').val(s.precio);
        $('#es_externo').prop('checked', !!s.es_externo);
        $('#activo').prop('checked', !!s.activo);
        modal.show();
    });

    // Delete handler
    $('.btn-delete').on('click', function () {
        const id = $(this).data('id');
        const nombre = $(this).data('nombre');

        Swal.fire({
            title: '¿Eliminar servicio?',
            text: `Vas a retirar "${nombre}" del catálogo. Esta acción no se puede deshacer.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar',
            customClass: {
                popup: 'rounded-4 shadow-lg'
            }
        }).then((result) => {
            if (result.isConfirmed) {
                const deleteForm = $('<form>', {
                    'action': `/servicios/${id}/delete`,
                    'method': 'POST'
                });
                $('body').append(deleteForm);
                deleteForm.submit();
            }
        });
    });
});
