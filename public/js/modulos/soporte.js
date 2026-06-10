// Manejar envío de formulario
document.getElementById('soporteForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnSubmit');

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Enviando...';

    try {
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());

        const response = await fetch('/soporte/enviar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const resData = await response.json();

        if (resData.success) {
            await Swal.fire('¡Enviado!', resData.message, 'success');
            window.location.reload();
        } else {
            throw new Error(resData.message || 'Error desconocido');
        }
    } catch (error) {
        Swal.fire('Error', error.message, 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-send me-1"></i> Enviar Ticket';
    }
});

// Manejar modal ver ticket
document.querySelectorAll('.btn-ver').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const b = e.currentTarget;
        document.getElementById('modalTicketId').textContent = b.dataset.id;
        document.getElementById('modalTicketTipo').textContent = b.dataset.tipo.toUpperCase();

        const estadoText = b.dataset.estado.replace('_', ' ').toUpperCase();
        const badge = document.getElementById('modalTicketEstado');
        badge.className = 'badge ticket-status-' + b.dataset.estado;
        badge.textContent = estadoText;

        document.getElementById('modalTicketDesc').textContent = b.dataset.desc;
        document.getElementById('modalTicketResp').textContent = b.dataset.resp;
    });
});
