/**
 * leads.js — Prospectos de la calculadora: marcar quién ya fue contactado.
 */
(function () {
    'use strict';

    document.querySelectorAll('.lead-contactado').forEach(check => {
        check.addEventListener('change', async () => {
            const marcado = check.checked;
            try {
                await GF.api(`/admin/leads/${check.dataset.id}/contactado`, {
                    method: 'PATCH',
                    body: { contactado: marcado }
                }, 'No se pudo actualizar el prospecto');
            } catch (error) {
                check.checked = !marcado;
                GF.error(error.message);
            }
        });
    });
})();
