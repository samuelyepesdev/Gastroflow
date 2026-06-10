let pollingInterval;

function updateUI(status, qr, pairingCode) {
    const $badge = $('#statusBadge');
    const $text = $('#statusText');
    const $qrContainer = $('#qrContainer');
    const $pairingContainer = $('#pairingCodeContainer');
    const $connectedContainer = $('#connectedContainer');
    const $btnConnect = $('#btnConnect');
    const $options = $('#connectOptions');

    $badge.removeClass('status-connected status-disconnected status-waiting');
    $qrContainer.addClass('d-none');
    $pairingContainer.addClass('d-none');
    $connectedContainer.addClass('d-none');
    $btnConnect.prop('disabled', false);
    $options.addClass('d-none');
    $('#btnCancel').addClass('d-none');

    if (status === 'conectado') {
        $badge.addClass('status-connected');
        $text.text('Conectado');
        $connectedContainer.removeClass('d-none');
        $('#btnCancel').removeClass('d-none').text('Desconectar');
    } else if (status === 'esperando_qr') {
        $badge.addClass('status-waiting');
        $text.text('Esperando vinculación');

        if (pairingCode && pairingCode.trim() !== '') {
            $('#pairingCodeDisplay').text(pairingCode);
            $pairingContainer.removeClass('d-none');
        } else if (qr) {
            $('#qrImage').attr('src', qr);
            $qrContainer.removeClass('d-none');
        } else {
            $badge.html('<span class="spinner-border spinner-border-sm me-2"></span>Generando...');
        }
        $('#btnCancel').removeClass('d-none').text('Cancelar / Reiniciar');
    } else {
        $badge.addClass('status-disconnected');
        $text.text('Desconectado');
        $options.removeClass('d-none');
    }
}

async function checkStatus() {
    try {
        const res = await fetch('/whatsapp/status');
        const data = await res.json();
        updateUI(data.estado, data.last_qr, data.last_pairing_code);
    } catch (e) {
        console.error('Error al verificar estado', e);
    }
}

$('#btnConnect').click(async function () {
    $(this).prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-2"></span>Iniciando...');
    try {
        const res = await fetch('/whatsapp/connect', { method: 'POST' });
        if (res.ok) {
            Swal.fire('Iniciado', 'Estamos preparando el código QR...', 'info');
            if (!pollingInterval) pollingInterval = setInterval(checkStatus, 3000);
        }
    } catch (e) {
        Swal.fire('Error', 'No se pudo iniciar la conexión', 'error');
        $(this).prop('disabled', false).html('<i class="bi bi-qr-code me-2"></i>Conectar con Código QR');
    }
});

$('#btnConnectCode').click(async function () {
    const phone = $('#pairingPhone').val();
    if (!phone || phone.length < 8) {
        Swal.fire('Atención', 'Ingresa tu número de teléfono con código de país (ej: 573123456789)', 'warning');
        return;
    }

    $(this).prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-2"></span>Iniciando...');
    try {
        const res = await fetch('/whatsapp/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phoneNumber: phone })
        });
        if (res.ok) {
            Swal.fire('Iniciado', 'Estamos generando tu código de vinculación...', 'info');
            if (!pollingInterval) pollingInterval = setInterval(checkStatus, 3000);
        }
    } catch (e) {
        Swal.fire('Error', 'No se pudo iniciar la conexión', 'error');
        $(this).prop('disabled', false).text('Vincular con Código');
    }
});

$('#formConfig').submit(async function (e) {
    e.preventDefault();
    const $btn = $(this).find('button[type="submit"]');
    $btn.prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-2"></span>Guardando...');

    const formData = {
        mensaje_bienvenida: $(this).find('textarea[name="mensaje_bienvenida"]').val(),
        mensaje_transferencia: $(this).find('textarea[name="mensaje_transferencia"]').val()
    };

    try {
        const res = await fetch('/whatsapp/save-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        if (res.ok) {
            Swal.fire({
                icon: 'success',
                title: 'Guardado',
                text: 'La configuración de mensajes se ha actualizado correctamente.',
                timer: 2000,
                showConfirmButton: false
            });
        } else {
            throw new Error('No se pudo guardar');
        }
    } catch (e) {
        Swal.fire('Error', 'No se pudieron guardar los cambios', 'error');
    } finally {
        $btn.prop('disabled', false).html('<i class="bi bi-save me-2"></i>Guardar Configuración');
    }
});

async function desconectar() {
    const result = await Swal.fire({
        title: '¿Desconectar WhatsApp?',
        text: 'Se cerrará la sesión actual y el bot dejará de responder.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, desconectar',
        cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
        try {
            const res = await fetch('/whatsapp/disconnect', { method: 'POST' });
            if (res.ok) {
                Swal.fire('Desconectado', 'La sesión ha sido cerrada.', 'success');
                checkStatus();
            }
        } catch (e) {
            Swal.fire('Error', 'No se pudo desconectar', 'error');
        }
    }
}

// Iniciar polling
pollingInterval = setInterval(checkStatus, 3000);
checkStatus();
