// Handle crear múltiples mesas
$(document).ready(function () {
    const modalCrearMasivas = new bootstrap.Modal(document.getElementById('modalCrearMasivas'));

    $('#btnCrearMasivas').on('click', function () {
        $('#formCrearMasivas')[0].reset();
        $('#cantidadMesas').val(10);
        modalCrearMasivas.show();
    });

    $('#btnConfirmarCrearMasivas').on('click', async function () {
        const cantidad = parseInt($('#cantidadMesas').val());
        const prefijo = $('#prefijoMesas').val().trim();

        if (!cantidad || cantidad < 1 || cantidad > 100) {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'La cantidad debe estar entre 1 y 100'
            });
            return;
        }

        $(this).prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-1"></span>Creando...');

        try {
            const token = localStorage.getItem('auth_token') || '';

            const response = await fetch('/api/mesas/crear-masivas', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ cantidad, prefijo: prefijo || null })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Error al crear mesas');
            }

            modalCrearMasivas.hide();

            let message = `Se crearon ${data.creadas} mesas exitosamente`;
            if (data.desde) {
                message += `\nDesde: ${data.desde}`;
            }
            if (data.errores > 0) {
                message += `\n${data.errores} mesas no se pudieron crear (ya existían)`;
            }

            await Swal.fire({
                icon: 'success',
                title: 'Mesas Creadas',
                text: message,
                timer: 3000
            });

            window.location.reload();

        } catch (error) {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: error.message
            });
        } finally {
            $(this).prop('disabled', false).html('<i class="bi bi-check-lg me-1"></i>Crear Mesas');
        }
    });
});

// Real-time notifications for new orders (SSE)
(function () {
    if (!!window.EventSource) {
        const source = new EventSource('/api/notifications/subscribe');

        source.addEventListener('message', function (e) {
            try {
                const data = JSON.parse(e.data);
                if (data.event === 'orderCreated') {
                    const isCancelled = data.action === 'cancelled';
                    const isQR = data.origen === 'qr';

                    if (typeof window.refreshMesaIfOpen === 'function' && data.mesaId) {
                        window.refreshMesaIfOpen(data.mesaId, data.action);
                    } else {
                        const Toast = Swal.mixin({
                            toast: true,
                            position: 'top-end',
                            showConfirmButton: false,
                            timer: 4000,
                            timerProgressBar: true
                        });

                        Toast.fire({
                            icon: isCancelled ? 'warning' : 'info',
                            title: isCancelled ? 'Pedido Cancelado' : (isQR ? 'Nuevo pedido QR' : 'Nuevo pedido WhatsApp'),
                            text: isCancelled ? `El pedido #${data.pedidoId} ha sido cancelado.` : 'Actualizando mesas...'
                        });

                        if (!isQR || isCancelled) {
                            setTimeout(() => {
                                window.location.reload();
                            }, 2000);
                        }
                    }
                }
            } catch (err) {
                console.error('Error procesando notificación:', err);
            }
        }, false);

        source.addEventListener('error', function (e) {
            if (e.readyState === EventSource.CLOSED) {
                console.log('SSE connection closed');
            }
        }, false);

        window.addEventListener('beforeunload', () => {
            source.close();
        });
    }
})();
