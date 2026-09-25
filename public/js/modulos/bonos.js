// Emisión, anulación y consulta de movimientos de bonos redimibles.
// Sin onclick inline (delegación de eventos), consistente con la convención CSP.

(function () {
    function fmt(n) {
        return '$' + (Number(n) || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    async function nuevoBono() {
        const { value: form } = await Swal.fire({
            title: '<h4 class="mb-0 fw-bold"><i class="bi bi-gift me-2 text-primary"></i>Emitir bono</h4>',
            html: `
                <div class="text-start">
                    <label class="form-label small text-muted mb-1">Valor del bono</label>
                    <input id="bonoValorInput" type="text" inputmode="decimal" class="swal2-input money-input" placeholder="Ej. 50.000" style="margin: 0 0 .75rem;">

                    <label class="form-label small text-muted mb-1">Origen</label>
                    <select id="bonoOrigenInput" class="swal2-select" style="margin: 0 0 .75rem; width: 100%;">
                        <option value="comprado">Comprado (el cliente pagó por él ahora)</option>
                        <option value="regalo">Regalo (fidelización, sin cobro)</option>
                    </select>

                    <label class="form-label small text-muted mb-1">Fecha de vencimiento (opcional)</label>
                    <input id="bonoVenceInput" type="date" class="swal2-input" style="margin: 0 0 .75rem;">

                    <label class="form-label small text-muted mb-1">Nota (opcional)</label>
                    <input id="bonoNotaInput" type="text" class="swal2-input" placeholder="Ej. Para Juan Pérez" style="margin: 0;">
                </div>
            `,
            focusConfirm: false,
            didOpen: popup => {
                const inp = popup.querySelector('#bonoValorInput');
                if (inp && window.MoneyInput) window.MoneyInput.attach(inp);
            },
            showCancelButton: true,
            confirmButtonText: 'Emitir bono',
            cancelButtonText: 'Cancelar',
            customClass: { popup: 'rounded-4 shadow' },
            preConfirm: () => {
                const popup = Swal.getPopup();
                const valorRaw = popup.querySelector('#bonoValorInput').value;
                const valor = window.MoneyInput ? window.MoneyInput.parse(valorRaw) : Number(valorRaw);
                const origen = popup.querySelector('#bonoOrigenInput').value;
                const fecha_vencimiento = popup.querySelector('#bonoVenceInput').value || null;
                const nota = popup.querySelector('#bonoNotaInput').value.trim();
                if (!valor || valor <= 0) {
                    Swal.showValidationMessage('Ingrese un valor válido');
                    return false;
                }
                return { valor, origen, fecha_vencimiento, nota };
            }
        });
        if (!form) return;

        try {
            const r = await fetch('/bonos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form)
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'No se pudo emitir el bono');

            const comprobanteHtml = data.imagen_url
                ? `<a href="${data.imagen_url}" target="_blank" rel="noopener" class="btn btn-outline-primary btn-sm mt-1"><i class="bi bi-file-earmark-pdf me-1"></i>Ver / descargar comprobante</a>`
                : '';
            Swal.fire({
                icon: 'success',
                title: 'Bono emitido',
                html: `<p>Código: <strong style="font-size:1.3rem">${data.codigo}</strong></p><p class="text-muted small">Entrégaselo al cliente -- lo va a necesitar para redimirlo.</p>${comprobanteHtml}`,
                confirmButtonText: 'Listo'
            }).then(() => location.reload());
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        }
    }

    async function verMovimientos(fila) {
        const id = fila.dataset.id;
        try {
            const r = await fetch(`/bonos/${id}`);
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'No se pudo cargar el bono');

            const filas = (data.movimientos || [])
                .map(m => {
                    const signo = m.tipo === 'redencion' || m.tipo === 'anulacion' ? '-' : '+';
                    const etiqueta = { emision: 'Emisión', redencion: 'Redención', anulacion: 'Anulación' }[m.tipo] || m.tipo;
                    const fecha = m.created_at ? new Date(m.created_at).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' }) : '-';
                    const factura = m.factura_numero != null ? ` (Factura #${m.factura_numero})` : '';
                    return `<tr><td class="text-start">${etiqueta}${factura}</td><td class="text-muted small">${fecha}</td><td class="text-end">${signo}${fmt(m.monto)}</td></tr>`;
                })
                .join('');

            const comprobanteHtml = data.bono.imagen_url
                ? `<p class="mb-2"><a href="${data.bono.imagen_url}" target="_blank" rel="noopener"><i class="bi bi-file-earmark-pdf me-1"></i>Ver comprobante</a></p>`
                : '';
            Swal.fire({
                title: `<h5 class="mb-0"><i class="bi bi-gift me-2"></i>${data.bono.codigo}</h5>`,
                html: `
                    <p class="mb-2">Saldo actual: <strong>${fmt(data.bono.saldo_actual)}</strong> de ${fmt(data.bono.valor_inicial)}</p>
                    ${comprobanteHtml}
                    <div class="table-responsive"><table class="table table-sm"><tbody>${filas || '<tr><td colspan="3" class="text-center text-muted py-3">Sin movimientos</td></tr>'}</tbody></table></div>
                `,
                width: '520px',
                confirmButtonText: 'Cerrar'
            });
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        }
    }

    async function anularBono(fila) {
        const id = fila.dataset.id;
        const result = await Swal.fire({
            title: '¿Anular este bono?',
            text: 'El saldo restante quedará invalidado y no se podrá redimir.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            confirmButtonText: 'Sí, anular'
        });
        if (!result.isConfirmed) return;

        try {
            const r = await fetch(`/bonos/${id}/anular`, { method: 'PUT' });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'No se pudo anular');
            location.reload();
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        const btnNuevo = document.getElementById('btnNuevoBono');
        if (btnNuevo) btnNuevo.addEventListener('click', nuevoBono);

        const tbody = document.getElementById('bonosTbody');
        if (tbody) {
            tbody.addEventListener('click', function (event) {
                const fila = event.target.closest('tr[data-id]');
                if (!fila) return;
                if (event.target.closest('.btn-ver-bono')) {
                    verMovimientos(fila);
                } else if (event.target.closest('.btn-anular-bono')) {
                    anularBono(fila);
                }
            });
        }
    });
})();
