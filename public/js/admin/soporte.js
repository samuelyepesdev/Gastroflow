// Cambiar estado directo
document.querySelectorAll('.status-select').forEach(select => {
    select.addEventListener('change', async (e) => {
        const id = e.target.dataset.id;
        const estado = e.target.value;
        try {
            const res = await fetch(`/admin/soporte/${id}/estado`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ estado })
            });
            const data = await res.json();
            if (data.success) {
                Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Estado actualizado', showConfirmButton: false, timer: 1500 });
            } else {
                throw new Error(data.message);
            }
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        }
    });
});

// Modal Responder
document.querySelectorAll('.btn-responder').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const b = e.currentTarget;
        document.getElementById('modalTicketId').textContent = b.dataset.id;
        document.getElementById('modalTenantName').textContent = b.dataset.tenant;
        document.getElementById('modalTicketDesc').textContent = b.dataset.desc;
        document.getElementById('replyTicketId').value = b.dataset.id;
        document.getElementById('replyText').value = b.dataset.resp;
    });
});

// Enviar Respuesta
document.getElementById('replyForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnSendReply');
    const id = document.getElementById('replyTicketId').value;
    const respuesta = document.getElementById('replyText').value;

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Enviando...';

    try {
        const res = await fetch(`/admin/soporte/${id}/responder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ respuesta })
        });
        const data = await res.json();

        if (data.success) {
            await Swal.fire('Enviado', data.message, 'success');
            window.location.reload();
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        Swal.fire('Error', error.message, 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-send me-1"></i> Enviar y Marcar Resuelto';
    }
});
