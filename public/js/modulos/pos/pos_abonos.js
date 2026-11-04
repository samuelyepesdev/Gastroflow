// POS Abonos — pago parcial de la cuenta de una orden, antes de cobrarla.
// Los abonos cuelgan del pedido de cocina que se crea al guardar la orden (los mismos que usa Mesas);
// al cobrar, el servidor los toma del pedido y los suma al desglose de la factura.

window.POS_ABONOS = {
    /** Relee los abonos de la orden cargada y repinta el saldo. */
    async recargar() {
        const pedidoId = POS.state.pedidoCocinaId;
        if (!pedidoId) {
            POS.state.abonado = 0;
        } else {
            try {
                const d = await POS_API.getAbonos(pedidoId);
                POS.state.abonado = Number(d.total_abonado) || 0;
            } catch (_) {
                POS.state.abonado = 0;
            }
        }
        POS_UI.renderCart();
    },

    async abonar() {
        if (!POS.state.cart.length) return;

        // Sin orden guardada no hay cuenta donde abonar: se guarda (y se envía a cocina, como "Guardar").
        try {
            await POS.asegurarOrdenGuardada();
            await this.recargar();
        } catch (err) {
            Swal.fire('Error', err.message || 'No se pudo preparar la cuenta', 'error');
            return;
        }

        const saldo = POS.getSaldo();
        if (saldo <= 0) {
            Swal.fire({ icon: 'info', title: 'No hay saldo pendiente por abonar' });
            return;
        }

        const { value: datos } = await Swal.fire({
            title: '<h4 class="mb-0 fw-bold text-success"><i class="bi bi-piggy-bank me-2"></i>Abonar a la cuenta</h4>',
            html: `
                <p class="mb-2 fs-6">Saldo pendiente: <strong>${GF.dinero(saldo)}</strong></p>
                <p class="text-muted small mb-3">Registra un pago parcial recibido ahora. Al cobrar, solo se pide el saldo.</p>
                <input id="posAbonoMonto" type="text" inputmode="decimal" class="swal2-input" placeholder="Monto recibido">
                <select id="posAbonoForma" class="swal2-select">
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                </select>`,
            focusConfirm: false,
            didOpen: popup => {
                const inp = popup.querySelector('#posAbonoMonto');
                if (inp) {
                    MoneyInput.attach(inp);
                    inp.focus();
                }
            },
            showCancelButton: true,
            confirmButtonText: 'Registrar abono',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#198754',
            customClass: { popup: 'rounded-4 shadow' },
            preConfirm: () => {
                const popup = Swal.getPopup();
                const monto = MoneyInput.parse(popup.querySelector('#posAbonoMonto').value);
                const forma_pago = popup.querySelector('#posAbonoForma').value;
                if (!monto || monto <= 0) {
                    Swal.showValidationMessage('Ingrese un monto válido');
                    return false;
                }
                if (monto > saldo) {
                    Swal.showValidationMessage(`El abono no puede superar el saldo pendiente (${GF.dinero(saldo)})`);
                    return false;
                }
                return { monto, forma_pago };
            }
        });
        if (!datos) return;

        try {
            // `total` es el total real del carrito (con descuentos): el servidor lo usa como tope.
            const d = await POS_API.registrarAbono(POS.state.pedidoCocinaId, { ...datos, total: POS.getTotal() });
            await this.recargar();
            Swal.fire({
                icon: 'success',
                title: 'Abono registrado',
                html: `<p>Saldo pendiente: <strong>${GF.dinero(POS.getSaldo())}</strong></p>`,
                confirmButtonColor: '#198754',
                customClass: { popup: 'rounded-4 shadow' }
            });
            return d;
        } catch (err) {
            Swal.fire({ icon: 'error', title: 'Error', text: err.message });
        }
    },

    async eliminar(abonoId) {
        const ok = await Swal.fire({
            title: '¿Eliminar este abono?',
            text: 'El monto vuelve a quedar como saldo pendiente.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#dc3545'
        });
        if (!ok.isConfirmed) return;
        try {
            await POS_API.eliminarAbono(abonoId);
            await this.recargar();
            this.ver();
        } catch (err) {
            Swal.fire({ icon: 'error', title: err.message });
        }
    },

    async ver() {
        const pedidoId = POS.state.pedidoCocinaId;
        if (!pedidoId) return;
        try {
            const d = await POS_API.getAbonos(pedidoId);
            const filas = (d.abonos || [])
                .map(
                    a => `<tr>
                        <td class="text-start">${a.forma_pago === 'efectivo' ? 'Efectivo' : 'Transferencia'}</td>
                        <td class="text-end">${GF.dinero(a.monto)}</td>
                        <td class="text-center">
                            <button type="button" class="btn btn-sm btn-outline-danger" data-abono-id="${Number(a.id)}" title="Eliminar abono">
                                <i class="bi bi-trash"></i>
                            </button>
                        </td>
                    </tr>`
                )
                .join('');
            Swal.fire({
                title: '<h5 class="mb-0 fw-bold"><i class="bi bi-piggy-bank me-2"></i>Abonos registrados</h5>',
                html: `
                    <div class="table-responsive" style="max-height: 280px;">
                        <table class="table table-sm align-middle">
                            <thead><tr><th class="text-start">Método</th><th class="text-end">Monto</th><th></th></tr></thead>
                            <tbody>${filas || '<tr><td colspan="3" class="text-center text-muted py-3">Sin abonos registrados</td></tr>'}</tbody>
                        </table>
                    </div>
                    <p class="text-end fw-bold mb-0 mt-2">Saldo pendiente: ${GF.dinero(POS.getSaldo())}</p>`,
                confirmButtonText: 'Cerrar',
                confirmButtonColor: '#5b6b7e',
                customClass: { popup: 'rounded-4 shadow' },
                didOpen: popup => {
                    popup.querySelectorAll('[data-abono-id]').forEach(btn => {
                        btn.addEventListener('click', () => POS_ABONOS.eliminar(Number(btn.dataset.abonoId)));
                    });
                }
            });
        } catch (err) {
            Swal.fire({ icon: 'error', title: err.message });
        }
    }
};
