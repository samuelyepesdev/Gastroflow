document.addEventListener('DOMContentLoaded', function () {
    if (!sessionStorage.getItem('eventosMotrados')) {
        const eventosHoy = [];
        const eventosProx = [];

        document.querySelectorAll('.event-card-item').forEach(el => {
            const nombre = el.getAttribute('data-nombre');
            const enCurso = el.getAttribute('data-curso') === 'true';
            const fecha = el.getAttribute('data-inicio');

            if (enCurso) eventosHoy.push(nombre);
            else eventosProx.push(`${nombre} (${fecha})`);
        });

        let htmlContent = '<div class="text-start mt-3">';
        if (eventosHoy.length > 0) {
            htmlContent += '<h5 class="text-primary fw-bold mb-2"><i class="bi bi-calendar-event me-2"></i>Eventos de ¡HOY!</h5>';
            htmlContent += '<ul class="list-group mb-3">';
            eventosHoy.forEach(e => htmlContent += `<li class="list-group-item bg-light border-primary border-start border-4"><strong>${e}</strong></li>`);
            htmlContent += '</ul>';
        }

        if (eventosProx.length > 0) {
            htmlContent += '<h5 class="text-info fw-bold mb-2 pt-2"><i class="bi bi-calendar-plus me-2"></i>Próximamente</h5>';
            htmlContent += '<ul class="list-group">';
            eventosProx.forEach(e => htmlContent += `<li class="list-group-item bg-light">${e}</li>`);
            htmlContent += '</ul>';
        }
        htmlContent += '</div>';

        Swal.fire({
            title: '<strong>¡Recordatorio de Eventos!</strong>',
            icon: 'info',
            html: htmlContent,
            showCloseButton: true,
            focusConfirm: false,
            confirmButtonText: '<i class="bi bi-check-lg"></i> ¡Entendido!',
            confirmButtonColor: '#2563eb',
            customClass: {
                popup: 'rounded-4'
            }
        });

        sessionStorage.setItem('eventosMotrados', 'true');
    }
});
