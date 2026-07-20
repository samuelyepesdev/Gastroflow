// POS UI — renderizado del catálogo, carrito y componentes visuales

const CAT_PALETTE = [
    { color: '#3b82f6', soft: '#eff6ff' },
    { color: '#10b981', soft: '#ecfdf5' },
    { color: '#f59e0b', soft: '#fffbeb' },
    { color: '#ef4444', soft: '#fef2f2' },
    { color: '#8b5cf6', soft: '#f5f3ff' },
    { color: '#06b6d4', soft: '#ecfeff' },
    { color: '#f97316', soft: '#fff7ed' },
    { color: '#84cc16', soft: '#f7fee7' },
    { color: '#ec4899', soft: '#fdf2f8' },
    { color: '#14b8a6', soft: '#f0fdfa' }
];

function catIcon(catNombre) {
    const n = (catNombre || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (/bebida|jugo|agua|gaseosa|cafe|te$| te |coco|limo/.test(n)) return 'bi-cup-straw';
    if (/postre|dulce|helado|torta|cake|brownie|galleta/.test(n)) return 'bi-cake';
    if (/coctel|trago|licor|ron|cerveza|vino|mojito|margarita/.test(n)) return 'bi-cup-fill';
    if (/ensalada|vegetal|verdura|fruta/.test(n)) return 'bi-flower1';
    if (/sopa|caldo/.test(n)) return 'bi-droplet';
    if (/pizza/.test(n)) return 'bi-slash-circle';
    if (/burger|hamburgue|sandwich|sanwich/.test(n)) return 'bi-grid-3x3-gap-fill';
    if (/acompan|guarnicion|extra|adicional|salsa/.test(n)) return 'bi-grid';
    return 'bi-egg-fried';
}

function money(n) {
    return '$ ' + Math.round(n).toLocaleString('es-CO');
}

window.POS_UI = {

    // ─── Catálogo ────────────────────────────────────────────────
    renderCats() {
        const bar = document.getElementById('posCatsBar');
        if (!bar) return;

        // Conservar el chip "Todos"
        [...bar.querySelectorAll('.pos-cat-chip:not([data-cat="all"])')].forEach(b => b.remove());

        POS.state.categorias.forEach((cat, idx) => {
            const { color } = CAT_PALETTE[idx % CAT_PALETTE.length];
            const btn = document.createElement('button');
            btn.className = 'pos-cat-chip';
            btn.dataset.cat = cat.id;
            btn.innerHTML = `<span class="pos-cat-dot" style="background:${color}"></span>${cat.nombre}`;
            btn.addEventListener('click', () => {
                document.querySelectorAll('.pos-cat-chip').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                POS.setCategoria(cat.id);
            });
            bar.appendChild(btn);
        });

        bar.querySelector('.pos-cat-chip[data-cat="all"]')?.addEventListener('click', function () {
            document.querySelectorAll('.pos-cat-chip').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            POS.setCategoria('all');
        });
    },

    renderCatalogo() {
        const grid = document.getElementById('posProductGrid');
        if (!grid) return;

        const { filtrados, categorias } = POS.state;

        const paletteMap = {};
        categorias.forEach((cat, idx) => {
            paletteMap[cat.id] = CAT_PALETTE[idx % CAT_PALETTE.length];
        });

        // Cantidad en carrito por producto
        const cartMap = {};
        POS.state.cart.forEach(item => { cartMap[item.producto_id] = item.cantidad; });

        if (!filtrados.length) {
            grid.innerHTML = `<div class="pos-catalog-empty">
                <i class="bi bi-search"></i>
                <p>Sin productos</p>
            </div>`;
            return;
        }

        grid.innerHTML = filtrados.map(p => {
            const { color, soft } = paletteMap[p.categoria_id] || { color: '#6366f1', soft: '#ede9fe' };
            const qty = cartMap[p.id] || 0;
            const badge = qty ? `<span class="ppc-qty-badge">${qty}</span>` : '';
            const inCartClass = qty ? ' ppc-in-cart' : '';
            return `<button class="pos-product-card${inCartClass}" data-pid="${p.id}">
                ${badge}
                <span class="ppc-icon" style="background:${soft};color:${color}">
                    <i class="bi ${catIcon(p.categoria_nombre)}"></i>
                </span>
                <span class="ppc-cat-label" style="color:${color}">${p.categoria_nombre || 'Sin cat.'}</span>
                <span class="ppc-name">${p.nombre}</span>
                <span class="ppc-price">${money(p.precio_unidad)}</span>
            </button>`;
        }).join('');

        // Delegación de eventos — CSP safe (sin onclick inline)
        grid.querySelectorAll('.pos-product-card[data-pid]').forEach(btn => {
            btn.addEventListener('click', () => POS.addToCart(Number.parseInt(btn.dataset.pid)));
        });
    },

    flashCard(productoId) {
        document.querySelectorAll(`.pos-product-card[data-pid="${productoId}"]`).forEach(card => {
            card.classList.add('ppc-flash');
            setTimeout(() => card.classList.remove('ppc-flash'), 350);
        });
    },

    // ─── Carrito ──────────────────────────────────────────────────
    // IMPORTANTE: siempre regenera innerHTML — nunca reutiliza nodos (fix del bug de posCartEmpty desconectado)
    renderCart() {
        const { cart } = POS.state;
        const container = document.getElementById('posCartItems');
        if (!container) return;

        if (!cart.length) {
            container.innerHTML = `<div class="pos-cart-empty">
                <div class="pos-cart-empty-icon"><i class="bi bi-cart-x"></i></div>
                <div class="pos-cart-empty-title">Carrito vacío</div>
                <div class="pos-cart-empty-sub">Toca un producto del catálogo para agregarlo a la orden.</div>
            </div>`;
        } else {
            const paletteMap = {};
            POS.state.categorias.forEach((cat, idx) => {
                paletteMap[cat.id] = CAT_PALETTE[idx % CAT_PALETTE.length];
            });

            container.innerHTML = cart.map((item, idx) => {
                const sub = POS.itemSubtotal(item);
                const isOne = item.cantidad === 1;
                const descBadge = item.descuento_porcentaje > 0
                    ? `<span class="pci-disc-badge">-${item.descuento_porcentaje}%</span>` : '';
                return `<div class="pos-cart-item">
                    <div class="pci-body">
                        <div class="pci-info">
                            <div class="pci-name">${item.nombre}${descBadge}</div>
                            <div class="pci-unit">${money(item.precio)} c/u</div>
                        </div>
                        <div class="pci-controls">
                            <div class="pci-qty-group">
                                <button class="pci-qty-btn" data-pci-action="${isOne ? 'del' : 'minus'}" data-pci-idx="${idx}">
                                    <i class="bi ${isOne ? 'bi-trash3' : 'bi-dash-lg'}"></i>
                                </button>
                                <span class="pci-qty-val">${item.cantidad}</span>
                                <button class="pci-qty-btn pci-qty-plus" data-pci-action="plus" data-pci-idx="${idx}">
                                    <i class="bi bi-plus-lg"></i>
                                </button>
                            </div>
                            <span class="pci-total">${money(sub)}</span>
                        </div>
                    </div>
                    <div class="pci-actions-row">
                        <button class="pci-action-btn pci-desc-btn" data-pci-action="desc" data-pci-idx="${idx}">
                            <i class="bi bi-percent me-1"></i>Desc.
                        </button>
                        <button class="pci-action-btn pci-del-btn" data-pci-action="del" data-pci-idx="${idx}">
                            <i class="bi bi-x-lg"></i>
                        </button>
                    </div>
                </div>`;
            }).join('');

            // Delegación de eventos — CSP safe
            container.querySelectorAll('[data-pci-action]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const action = btn.dataset.pciAction;
                    const idx = Number.parseInt(btn.dataset.pciIdx);
                    const item = POS.state.cart[idx];
                    if (action === 'minus' && item) POS.updateQty(idx, item.cantidad - 1);
                    else if (action === 'plus' && item) POS.updateQty(idx, item.cantidad + 1);
                    else if (action === 'del') POS.removeFromCart(idx);
                    else if (action === 'desc') POS_PAGO.abrirDescuento(idx);
                });
            });
        }

        // Totales
        const total = POS.getTotal();
        const totalesEl = document.getElementById('posTotales');
        if (totalesEl) {
            const units = cart.reduce((s, i) => s + i.cantidad, 0);
            const emptyColor = !cart.length ? '#9aa3b2' : '#0f172a';
            totalesEl.innerHTML = `
                <div class="pos-total-row">
                    <span>Subtotal <span class="pos-units-count">(${units} u.)</span></span>
                    <span>${money(total)}</span>
                </div>
                <div class="pos-total-divider"></div>
                <div class="pos-total-row pos-total-main">
                    <span>Total</span>
                    <span class="pos-total-amount" style="color:${emptyColor}">${money(total)}</span>
                </div>`;
        }

        const cobrarBtn = document.getElementById('posBtnCobrar');
        if (cobrarBtn) {
            cobrarBtn.disabled = !cart.length;
            const totalSpan = document.getElementById('posCobrarTotal');
            if (totalSpan) totalSpan.textContent = money(total);
        }

        // Badge del tab "Carrito" en móvil
        const mobileBadge = document.getElementById('posMobileCartBadge');
        if (mobileBadge) {
            const units = cart.reduce((s, i) => s + i.cantidad, 0);
            mobileBadge.textContent = units;
            mobileBadge.style.display = units ? '' : 'none';
        }
    },

    // ─── Cliente ──────────────────────────────────────────────────
    setClienteUI(cliente) {
        const inp = document.getElementById('posClienteInput');
        const hid = document.getElementById('posClienteId');
        if (inp) inp.value = cliente.nombre || '';
        if (hid) hid.value = cliente.id || '';
    },

    renderClienteSugerencias(lista) {
        const dropdown = document.getElementById('posClienteSugerencias');
        if (!dropdown) return;
        if (!lista.length) { dropdown.style.display = 'none'; return; }

        POS_UI._clienteCache = lista;
        dropdown.innerHTML = lista.map((c, idx) => `
            <div class="pos-customer-item" data-cli-idx="${idx}">
                <span class="fw-semibold">${c.nombre}</span>
                <span class="text-muted small">${c.telefono || ''}</span>
            </div>`).join('');
        dropdown.querySelectorAll('[data-cli-idx]').forEach(el => {
            el.addEventListener('click', () => {
                const c = POS_UI._clienteCache[Number.parseInt(el.dataset.cliIdx)];
                if (c) POS_UI._seleccionarCliente(c);
            });
        });
        dropdown.style.display = '';
    },

    _seleccionarCliente(cliente) {
        POS.setCliente(cliente);
        const sug = document.getElementById('posClienteSugerencias');
        if (sug) sug.style.display = 'none';
    },

    // ─── Stats ───────────────────────────────────────────────────
    renderStats() {
        const { num_ordenes, total_hoy } = POS.state.stats;
        const el1 = document.getElementById('posStatsOrdenes');
        const el2 = document.getElementById('posStatsTotal');
        if (el1) el1.textContent = num_ordenes || 0;
        if (el2) el2.textContent = money(total_hoy || 0);
    },

    // ─── Borradores ──────────────────────────────────────────────
    updateBorradoresCount() {
        const el = document.getElementById('posBorradoresCount');
        if (el) el.textContent = POS.state.borradores.length;
    },

    renderBorradoresModal() {
        const tbody = document.getElementById('posBorradoresTbody');
        if (!tbody) return;
        const { borradores } = POS.state;

        if (!borradores.length) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">
                <i class="bi bi-inbox me-2"></i>No hay órdenes guardadas
            </td></tr>`;
            return;
        }

        POS_UI._borradoresCache = borradores;
        tbody.innerHTML = borradores.map((b, idx) => {
            const n = b.items.length;
            const total = money(b.total || 0);
            const hora = new Date(b.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
            return `<tr>
                <td>${b.nombre_cliente || 'Consumidor final'}</td>
                <td>${n} ítem${n !== 1 ? 's' : ''}</td>
                <td class="fw-semibold">${total}</td>
                <td class="text-muted small">${hora}</td>
                <td>
                    <button class="btn btn-sm btn-primary me-1" data-bor-idx="${idx}">
                        <i class="bi bi-arrow-up-circle me-1"></i>Cargar
                    </button>
                    <button class="btn btn-sm btn-outline-danger" data-bor-del="${b.id}">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>`;
        }).join('');

        tbody.querySelectorAll('[data-bor-idx]').forEach(btn => {
            btn.addEventListener('click', () => {
                const b = POS_UI._borradoresCache[Number.parseInt(btn.dataset.borIdx)];
                if (b) POS.cargarBorrador(b);
            });
        });

        tbody.querySelectorAll('[data-bor-del]').forEach(btn => {
            btn.addEventListener('click', () => POS_UI._eliminarBorrador(Number.parseInt(btn.dataset.borDel), btn));
        });
    },

    async _eliminarBorrador(id, btn) {
        btn.disabled = true;
        await POS_API.deleteBorrador(id);
        await POS.recargarBorradores();
        POS_UI.renderBorradoresModal();
    }
};
