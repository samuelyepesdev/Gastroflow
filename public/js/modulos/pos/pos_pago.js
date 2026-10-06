// POS Pago — lógica del modal de cobro y descuentos

window.POS_PAGO = {
    _descIdx: null,
    // Bono aplicado a la venta en curso: { codigo, monto } o null.
    _bono: null,

    // ─── Modal de cobro ───────────────────────────────────────────
    abrirModal() {
        const total = POS.getTotal();
        const { cart } = POS.state;

        // Resumen de ítems
        document.getElementById('posPagoItems').innerHTML = cart.map(item => {
            const sub = POS.itemSubtotal(item);
            let desc = '';
            if (item.descuento_valor > 0) {
                desc = ` <span class="text-success small">(-$${Number(item.descuento_valor).toLocaleString('es-CO')})</span>`;
            } else if (item.descuento_porcentaje > 0) {
                desc = ` <span class="text-success small">(-${item.descuento_porcentaje}%)</span>`;
            }
            return `<div class="pos-pago-item-row">
                <span>${GF.escapeHtml(item.nombre)} x${item.cantidad}${desc}</span>
                <span>$ ${sub.toLocaleString('es-CO')}</span>
            </div>`;
        }).join('');

        // Reset del bono (cada cobro arranca sin bono aplicado)
        this._bono = null;
        const inputBono = document.getElementById('posCodigoBono');
        if (inputBono) { inputBono.value = ''; inputBono.disabled = false; }
        document.getElementById('posValidarBonoBtn')?.classList.remove('d-none');
        document.getElementById('posQuitarBonoBtn')?.classList.add('d-none');
        this._setBonoInfo('', null);

        // Reset
        document.getElementById('posEfectivoRecibido').value = '';
        document.getElementById('posVueltoAmount').textContent = '$ 0';
        document.getElementById('posEfectivoSection').style.display = '';
        document.getElementById('posConfirmarPagoBtn').disabled = false;
        document.getElementById('posPagoMetodo').value = 'efectivo';

        document.querySelectorAll('.pos-method-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.pos-method-btn[data-method="efectivo"]')?.classList.add('active');

        this._refrescarTotales();

        new bootstrap.Modal(document.getElementById('posPagoModal')).show();
        setTimeout(() => document.getElementById('posEfectivoRecibido')?.focus(), 300);
    },

    /** Lo que de verdad se cobra en efectivo/transferencia: total menos el bono aplicado. */
    getTotalACobrar() {
        return Math.max(0, Math.round((POS.getTotal() - (this._bono?.monto || 0)) * 100) / 100);
    },

    _setBonoInfo(texto, ok) {
        const el = document.getElementById('posBonoInfo');
        if (!el) return;
        el.textContent = texto;
        el.classList.toggle('text-success', ok === true);
        el.classList.toggle('text-danger', ok === false);
    },

    // Repinta total, líneas de bono y métodos según lo que falte por cobrar.
    _refrescarTotales() {
        const aCobrar = this.getTotalACobrar();
        const cubreTodo = !!this._bono && aCobrar <= 0;

        document.getElementById('posPagoTotal').textContent = '$ ' + aCobrar.toLocaleString('es-CO');
        document.getElementById('posBonoAplicadoLinea')?.classList.toggle('d-none', !this._bono);
        const montoBono = document.getElementById('posBonoAplicadoMonto');
        if (montoBono) montoBono.textContent = '-$ ' + (this._bono?.monto || 0).toLocaleString('es-CO');
        document.getElementById('posAvisoBonoCubre')?.classList.toggle('d-none', !cubreTodo);
        document.getElementById('posMetodosWrap')?.classList.toggle('d-none', cubreTodo);

        document.getElementById('posEfectivoRecibido').value = '';
        document.getElementById('posVueltoAmount').textContent = '$ 0';
        this._renderQuickAmounts(aCobrar);
        // Con el bono cubriendo todo no hay nada que recibir; si no, se vuelve a validar el efectivo.
        if (cubreTodo) {
            document.getElementById('posConfirmarPagoBtn').disabled = false;
        } else {
            this.setMetodo(document.getElementById('posPagoMetodo').value || 'efectivo');
        }
    },

    async validarBono() {
        const input = document.getElementById('posCodigoBono');
        // Puede ser el código corto o la URL que trae el QR (el lector la escribe aquí).
        const entrada = (input?.value || '').trim();
        if (!entrada) { this._setBonoInfo('', null); return; }

        this._setBonoInfo('Consultando...', null);
        try {
            const d = await GF.api(`/api/bonos/validar/${encodeURIComponent(entrada)}`, {}, 'Código de bono inválido');
            // El código canónico lo da el servidor (la entrada pudo ser una URL).
            const codigo = d.codigo;
            input.value = codigo;
            this._bono = { codigo, monto: Math.min(Number(d.saldo_actual), POS.getTotal()) };
            this._setBonoInfo(`Bono aplicado · saldo disponible: ${GF.dinero(d.saldo_actual)}`, true);
            input.disabled = true;
            document.getElementById('posValidarBonoBtn').classList.add('d-none');
            document.getElementById('posQuitarBonoBtn').classList.remove('d-none');
            this._refrescarTotales();
        } catch (err) {
            this._setBonoInfo(err.message, false);
        }
    },

    quitarBono() {
        this._bono = null;
        const input = document.getElementById('posCodigoBono');
        if (input) { input.value = ''; input.disabled = false; }
        document.getElementById('posValidarBonoBtn').classList.remove('d-none');
        document.getElementById('posQuitarBonoBtn').classList.add('d-none');
        this._setBonoInfo('', null);
        this._refrescarTotales();
    },

    _renderQuickAmounts(total) {
        const container = document.getElementById('posQuickAmounts');
        if (!container) return;
        const base = Math.ceil(total / 1000) * 1000;
        const opciones = [base, base + 5000, base + 10000, base + 20000]
            .filter((v, i, a) => a.indexOf(v) === i);

        container.innerHTML = opciones.map(v =>
            `<button type="button" class="pos-quick-amt" data-amt="${v}">$ ${v.toLocaleString('es-CO')}</button>`
        ).join('');

        // Delegación de eventos — CSP safe (sin onclick inline)
        container.querySelectorAll('.pos-quick-amt').forEach(btn => {
            btn.addEventListener('click', () => POS_PAGO._setRecibido(Number.parseInt(btn.dataset.amt)));
        });
    },

    _setRecibido(val) {
        const inp = document.getElementById('posEfectivoRecibido');
        if (inp) { inp.value = MoneyInput.format(String(val)); this.calcularVuelto(); }
    },

    calcularVuelto() {
        const total = this.getTotalACobrar();
        const recibido = MoneyInput.parse(document.getElementById('posEfectivoRecibido')?.value);
        const vuelto = Math.max(0, recibido - total);
        document.getElementById('posVueltoAmount').textContent = '$ ' + vuelto.toLocaleString('es-CO');
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
        const clienteId = document.getElementById('posClienteId')?.value || null;
        const nombreCliente = document.getElementById('posClienteInput')?.value?.trim() || 'Consumidor final';
        const formaPago = document.getElementById('posPagoMetodo')?.value || 'efectivo';
        const total = POS.getTotal();
        const bono = this._bono;
        // Si el bono cubre todo no se eligió método: el servidor solo cobra por ahí lo que sobre.
        const cubreTodo = !!bono && this.getTotalACobrar() <= 0;
        // Efectivo recibido (informativo, para "Recibido/Cambio" en el ticket).
        const efectivoRecibido =
            formaPago === 'efectivo' && !cubreTodo ? MoneyInput.parse(document.getElementById('posEfectivoRecibido')?.value) : 0;

        const btn = document.getElementById('posConfirmarPagoBtn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Procesando...';

        try {
            const payload = {
                // El servidor resuelve el cliente si no hay ID
                cliente_id: clienteId ? Number.parseInt(clienteId) : null,
                nombre_cliente: nombreCliente,
                // Si la orden ya se había guardado (y por eso ya está en cocina), se
                // completa allá al cobrarla en vez de crear un pedido de cocina nuevo.
                pedido_cocina_id: POS.state.pedidoCocinaId || null,
                // Si viene de una orden guardada cargada al carrito, se borra al cobrarla.
                borrador_id: POS.state.borradorId || null,
                total,
                forma_pago: formaPago,
                efectivo_recibido: efectivoRecibido > 0 ? efectivoRecibido : null,
                codigo_bono: bono ? bono.codigo : null,
                productos: POS.state.cart.map(item => {
                    const bruto = item.cantidad * item.precio;
                    const neto = item.descuento_valor > 0
                        ? Math.max(0, bruto - item.descuento_valor)
                        : bruto * (1 - (item.descuento_porcentaje || 0) / 100);
                    return {
                        producto_id: item.producto_id,
                        combo_id: item.combo_id || null,
                        selecciones: item.combo_id ? item.selecciones : undefined,
                        es_servicio: !!item.es_servicio,
                        servicio_id: item.servicio_id || null,
                        cantidad: item.cantidad,
                        precio: item.cantidad > 0 ? neto / item.cantidad : item.precio,
                        precio_original: item.precio_original,
                        unidad: item.unidad || 'UND',
                        subtotal: POS.itemSubtotal(item),
                        descuento_porcentaje: item.descuento_valor > 0 ? null : (item.descuento_porcentaje || null),
                        descuento_valor: item.descuento_valor > 0 ? item.descuento_valor : null,
                        modificadores_seleccion: item.modificadores_seleccion || []
                    };
                })
            };

            const result = await POS_API.crearFactura(payload);

            bootstrap.Modal.getInstance(document.getElementById('posPagoModal'))?.hide();

            // Impresión térmica + apertura de cajón vía QZ Tray, best-effort:
            // no se espera (no await) para no bloquear el resto del flujo si el
            // tenant no tiene QZ Tray configurado o instalado.
            POS_QZ.imprimirRecibo(result.id).catch(err => console.warn('QZ print falló', err));

            // Mostrar recibo en iframe (respaldo manual, siempre disponible)
            document.getElementById('posReceiptFrame').src = `/facturas/${result.id}/imprimir`;
            new bootstrap.Modal(document.getElementById('posReceiptModal')).show();

            POS.clearCart();
            POS.recargarStats();
            POS._goToCatalogTab();

        } catch (err) {
            Swal.fire('Error al cobrar', err.message || 'No se pudo procesar el pago', 'error');
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
        document.getElementById('posDescPrecio').textContent = '$ ' + Number(item.precio).toLocaleString('es-CO');
        const pctInput = document.getElementById('posDescPct');
        const valInput = document.getElementById('posDescValor');
        if (pctInput) pctInput.value = item.descuento_porcentaje || '';
        if (valInput) valInput.value = item.descuento_valor ? MoneyInput.format(String(item.descuento_valor)) : '';
        this.setDescTipo(item.descuento_valor > 0 ? 'valor' : 'porcentaje');

        new bootstrap.Modal(document.getElementById('posDescModal')).show();
    },

    // Alterna la vista %/$ dentro del modal de descuento.
    setDescTipo(tipo) {
        const esValor = tipo === 'valor';
        document.getElementById('posDescPanelPct')?.classList.toggle('d-none', esValor);
        document.getElementById('posDescPanelValor')?.classList.toggle('d-none', !esValor);
        document.querySelectorAll('.pos-desc-tipo-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.tipo === tipo);
        });
    },

    aplicarDescuento(pct) {
        if (this._descIdx === null) return;
        POS.setDescuento(this._descIdx, { tipo: 'porcentaje', valor: pct });
        bootstrap.Modal.getInstance(document.getElementById('posDescModal'))?.hide();
    },

    aplicarDescuentoValor(valor) {
        if (this._descIdx === null) return;
        POS.setDescuento(this._descIdx, { tipo: 'valor', valor: MoneyInput.parse(String(valor)) });
        bootstrap.Modal.getInstance(document.getElementById('posDescModal'))?.hide();
    },

    quitarDescuento() {
        if (this._descIdx === null) return;
        const item = POS.state.cart[this._descIdx];
        if (item) {
            item.precio = item.precio_original;
            item.descuento_porcentaje = 0;
            item.descuento_valor = 0;
            // Libera la línea: si tenía una promo "por cantidad" pendiente, vuelve a
            // quedar bajo el control de recalcularPromocionesPorCantidad.
            item.descuento_manual = false;
        }
        POS_UI.renderCart();
        bootstrap.Modal.getInstance(document.getElementById('posDescModal'))?.hide();
    }
};

// ─── Eventos del modal de pago ────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.pos-method-btn').forEach(btn => {
        btn.addEventListener('click', () => POS_PAGO.setMetodo(btn.dataset.method));
    });

    document.getElementById('posEfectivoRecibido')?.addEventListener('input', () => POS_PAGO.calcularVuelto());

    document.getElementById('posValidarBonoBtn')?.addEventListener('click', () => POS_PAGO.validarBono());
    document.getElementById('posQuitarBonoBtn')?.addEventListener('click', () => POS_PAGO.quitarBono());
    document.getElementById('posCodigoBono')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); POS_PAGO.validarBono(); }
    });

    document.getElementById('posConfirmarPagoBtn')?.addEventListener('click', () => POS_PAGO.confirmarPago());

    document.querySelectorAll('.pos-desc-quick').forEach(btn => {
        btn.addEventListener('click', () => POS_PAGO.aplicarDescuento(btn.dataset.pct));
    });

    document.querySelectorAll('.pos-desc-tipo-btn').forEach(btn => {
        btn.addEventListener('click', () => POS_PAGO.setDescTipo(btn.dataset.tipo));
    });

    document.getElementById('posDescAplicar')?.addEventListener('click', () => {
        POS_PAGO.aplicarDescuento(document.getElementById('posDescPct')?.value);
    });

    document.getElementById('posDescAplicarValor')?.addEventListener('click', () => {
        POS_PAGO.aplicarDescuentoValor(document.getElementById('posDescValor')?.value);
    });

    document.getElementById('posDescQuitar')?.addEventListener('click', () => POS_PAGO.quitarDescuento());

    document.getElementById('posDescPct')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') POS_PAGO.aplicarDescuento(e.target.value);
    });

    document.getElementById('posDescValor')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') POS_PAGO.aplicarDescuentoValor(e.target.value);
    });
});
