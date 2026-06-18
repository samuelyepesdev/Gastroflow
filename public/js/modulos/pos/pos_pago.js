// POS Pago — lógica del modal de cobro y descuentos

window.POS_PAGO = {
    _descIdx: null,

    // ─── Modal de cobro ───────────────────────────────────────────
    abrirModal() {
        const total = POS.getTotal();
        const { cart } = POS.state;

        // Resumen de ítems
        const itemsHtml = cart.map(item => {
            const sub = POS.itemSubtotal(item);
            const desc = item.descuento_porcentaje > 0 ? ` <span class="text-success">(-${item.descuento_porcentaje}%)</span>` : '';
            return `<div class="pos-pago-item-row">
                <span>${item.nombre} x${item.cantidad}${desc}</span>
                <span>$${sub.toLocaleString('es-CO')}</span>
            </div>`;
        }).join('');
        document.getElementById('posPagoItems').innerHTML = itemsHtml;

        // Total
        document.getElementById('posPagoTotal').textContent = '$' + total.toLocaleString('es-CO');

        // Reset campos
        document.getElementById('posEfectivoRecibido').value = '';
        document.getElementById('posVueltoAmount').textContent = '$0';
        document.getElementById('posEfectivoSection').style.display = '';
        document.getElementById('posConfirmarPagoBtn').disabled = false;
        document.getElementById('posPagoMetodo').value = 'efectivo';

        // Botones de método
        document.querySelectorAll('.pos-method-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.pos-method-btn[data-method="efectivo"]')?.classList.add('active');

        // Montos rápidos de efectivo
        this._renderQuickAmounts(total);

        new bootstrap.Modal(document.getElementById('posPagoModal')).show();

        setTimeout(() => document.getElementById('posEfectivoRecibido')?.focus(), 300);
    },

    _renderQuickAmounts(total) {
        const container = document.getElementById('posQuickAmounts');
        if (!container) return;
        const base = Math.ceil(total / 1000) * 1000;
        const opciones = [base, base + 5000, base + 10000, base + 20000].filter((v, i, a) => a.indexOf(v) === i);
        container.innerHTML = opciones.map(v =>
            `<button type="button" class="pos-quick-amt" onclick="POS_PAGO._setRecibido(${v})">
                $${v.toLocaleString('es-CO')}
            </button>`
        ).join('');
    },

    _setRecibido(val) {
        const inp = document.getElementById('posEfectivoRecibido');
        if (inp) { inp.value = val; this.calcularVuelto(); }
    },

    calcularVuelto() {
        const total = POS.getTotal();
        const recibido = parseFloat(document.getElementById('posEfectivoRecibido')?.value) || 0;
        const vuelto = Math.max(0, recibido - total);
        document.getElementById('posVueltoAmount').textContent = '$' + vuelto.toLocaleString('es-CO');
        document.getElementById('posConfirmarPagoBtn').disabled = (recibido < total);
    },

    setMetodo(metodo) {
        document.getElementById('posPagoMetodo').value = metodo;
        const esEfectivo = metodo === 'efectivo';
        document.getElementById('posEfectivoSection').style.display = esEfectivo ? '' : 'none';
        document.getElementById('posConfirmarPagoBtn').disabled = false;
        document.querySelectorAll('.pos-method-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.method === metodo);
        });
    },

    // ─── Confirmar pago ───────────────────────────────────────────
    async confirmarPago() {
        const clienteId = document.getElementById('posClienteId')?.value;
        if (!clienteId) {
            Swal.fire('Atención', 'Selecciona un cliente para continuar', 'warning');
            return;
        }

        const formaPago = document.getElementById('posPagoMetodo')?.value || 'efectivo';
        const total = POS.getTotal();

        const btn = document.getElementById('posConfirmarPagoBtn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Procesando...';

        try {
            const payload = {
                cliente_id: clienteId,
                total,
                forma_pago: formaPago,
                productos: POS.state.cart.map(item => ({
                    producto_id: item.producto_id,
                    cantidad: item.cantidad,
                    precio: item.precio * (1 - (item.descuento_porcentaje || 0) / 100),
                    precio_original: item.precio_original,
                    unidad: item.unidad || 'UND',
                    subtotal: POS.itemSubtotal(item),
                    descuento_porcentaje: item.descuento_porcentaje || null
                }))
            };

            const result = await POS_API.crearFactura(payload);

            bootstrap.Modal.getInstance(document.getElementById('posPagoModal'))?.hide();

            // Mostrar recibo
            document.getElementById('posReceiptFrame').src = `/facturas/${result.id}/imprimir`;
            new bootstrap.Modal(document.getElementById('posReceiptModal')).show();

            POS.clearCart();
            POS.recargarStats();

        } catch (err) {
            Swal.fire('Error', err.message || 'No se pudo procesar el pago', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-check-circle me-1"></i>Confirmar Pago';
        }
    },

    // ─── Descuento por ítem ───────────────────────────────────────
    abrirDescuento(idx) {
        this._descIdx = idx;
        const item = POS.state.cart[idx];
        if (!item) return;

        document.getElementById('posDescNombre').textContent = item.nombre;
        document.getElementById('posDescPrecio').textContent = '$' + Number(item.precio).toLocaleString('es-CO');
        document.getElementById('posDescPct').value = item.descuento_porcentaje || '';

        new bootstrap.Modal(document.getElementById('posDescModal')).show();
    },

    aplicarDescuento(pct) {
        if (this._descIdx === null) return;
        POS.setDescuento(this._descIdx, pct);
        bootstrap.Modal.getInstance(document.getElementById('posDescModal'))?.hide();
    },

    quitarDescuento() {
        if (this._descIdx === null) return;
        const item = POS.state.cart[this._descIdx];
        if (item) {
            item.precio = item.precio_original;
            item.descuento_porcentaje = 0;
        }
        POS_UI.renderCart();
        bootstrap.Modal.getInstance(document.getElementById('posDescModal'))?.hide();
    }
};

// ─── Eventos del modal de pago ────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Selector de método de pago
    document.querySelectorAll('.pos-method-btn').forEach(btn => {
        btn.addEventListener('click', () => POS_PAGO.setMetodo(btn.dataset.method));
    });

    // Calcular vuelto en tiempo real
    document.getElementById('posEfectivoRecibido')?.addEventListener('input', () => POS_PAGO.calcularVuelto());

    // Confirmar pago
    document.getElementById('posConfirmarPagoBtn')?.addEventListener('click', () => POS_PAGO.confirmarPago());

    // Descuento: botones rápidos
    document.querySelectorAll('.pos-desc-quick').forEach(btn => {
        btn.addEventListener('click', () => POS_PAGO.aplicarDescuento(btn.dataset.pct));
    });

    // Descuento: aplicar manual
    document.getElementById('posDescAplicar')?.addEventListener('click', () => {
        POS_PAGO.aplicarDescuento(document.getElementById('posDescPct')?.value);
    });

    // Descuento: quitar
    document.getElementById('posDescQuitar')?.addEventListener('click', () => POS_PAGO.quitarDescuento());

    // Enter en campo descuento
    document.getElementById('posDescPct')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') POS_PAGO.aplicarDescuento(e.target.value);
    });
});
