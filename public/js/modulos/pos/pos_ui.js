// POS UI — renderizado del catálogo, carrito y componentes visuales

const CAT_COLORS = [
    '#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6',
    '#06b6d4','#f97316','#84cc16','#ec4899','#14b8a6'
];

window.POS_UI = {

    // ─── Catálogo ────────────────────────────────────────────────
    renderCats() {
        const bar = document.getElementById('posCatsBar');
        if (!bar) return;

        // Limpiar botones de categorías previas (conservar el "Todos")
        [...bar.querySelectorAll('.pos-cat-pill:not([data-cat="all"])')].forEach(b => b.remove());

        POS.state.categorias.forEach((cat, idx) => {
            const color = CAT_COLORS[idx % CAT_COLORS.length];
            const btn = document.createElement('button');
            btn.className = 'pos-cat-pill';
            btn.dataset.cat = cat.id;
            btn.style.setProperty('--cat-color', color);
            btn.textContent = cat.nombre;
            btn.addEventListener('click', () => {
                document.querySelectorAll('.pos-cat-pill').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                POS.setCategoria(cat.id);
            });
            bar.appendChild(btn);
        });

        document.querySelector('.pos-cat-pill[data-cat="all"]')?.addEventListener('click', function () {
            document.querySelectorAll('.pos-cat-pill').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            POS.setCategoria('all');
        });
    },

    renderCatalogo() {
        const grid = document.getElementById('posProductGrid');
        if (!grid) return;

        const { filtrados, categorias } = POS.state;
        if (!filtrados.length) {
            grid.innerHTML = `<div class="pos-catalog-empty">
                <i class="bi bi-search"></i>
                <p>Sin productos</p>
                <small>Ajusta el filtro o la búsqueda</small>
            </div>`;
            return;
        }

        // Mapa de colores por categoría
        const colorMap = {};
        categorias.forEach((cat, idx) => {
            colorMap[cat.id] = CAT_COLORS[idx % CAT_COLORS.length];
        });

        grid.innerHTML = filtrados.map(p => {
            const precio = Number(p.precio_unidad).toLocaleString('es-CO');
            const color = colorMap[p.categoria_id] || '#6366f1';
            const favIcon = p.es_favorito ? '<i class="bi bi-star-fill pos-fav-icon"></i>' : '';
            return `<button class="pos-product-card" id="pcard-${p.id}" data-pid="${p.id}">
                ${favIcon}
                <div class="ppc-cat" style="background:${color}22;color:${color}">
                    ${p.categoria_nombre || 'Sin categoría'}
                </div>
                <div class="ppc-name">${p.nombre}</div>
                <div class="ppc-price">$${precio}</div>
            </button>`;
        }).join('');

        // Delegación de eventos para evitar JSON inline en onclick
        grid.querySelectorAll('.pos-product-card[data-pid]').forEach(btn => {
            btn.addEventListener('click', () => POS.addToCart(parseInt(btn.dataset.pid)));
        });
    },

    flashCard(productoId) {
        const card = document.getElementById(`pcard-${productoId}`);
        if (!card) return;
        card.classList.add('ppc-flash');
        setTimeout(() => card.classList.remove('ppc-flash'), 400);
    },

    // ─── Carrito ──────────────────────────────────────────────────
    renderCart() {
        const { cart } = POS.state;
        const container = document.getElementById('posCartItems');
        const emptyEl = document.getElementById('posCartEmpty');
        if (!container) return;

        const total = POS.getTotal();

        if (!cart.length) {
            if (emptyEl) emptyEl.style.display = '';
            container.innerHTML = '';
            container.appendChild(emptyEl);
        } else {
            const html = cart.map((item, idx) => {
                const sub = POS.itemSubtotal(item);
                const descBadge = item.descuento_porcentaje > 0
                    ? `<span class="badge bg-success ms-1">-${item.descuento_porcentaje}%</span>`
                    : '';
                return `<div class="pos-cart-item">
                    <div class="pci-top">
                        <span class="pci-name">${item.nombre}${descBadge}</span>
                        <span class="pci-sub">$${sub.toLocaleString('es-CO')}</span>
                    </div>
                    <div class="pci-bottom">
                        <span class="pci-unit-price">$${Number(item.precio).toLocaleString('es-CO')}</span>
                        <div class="pci-qty-group">
                            <button class="pci-btn" onclick="POS.updateQty(${idx}, ${item.cantidad - 1})">
                                <i class="bi bi-dash"></i>
                            </button>
                            <span class="pci-qty">${item.cantidad}</span>
                            <button class="pci-btn" onclick="POS.updateQty(${idx}, ${item.cantidad + 1})">
                                <i class="bi bi-plus"></i>
                            </button>
                        </div>
                        <div class="pci-actions">
                            <button class="pci-btn pci-btn-pct" onclick="POS_PAGO.abrirDescuento(${idx})" title="Descuento">
                                <i class="bi bi-percent"></i>
                            </button>
                            <button class="pci-btn pci-btn-del" onclick="POS.removeFromCart(${idx})" title="Eliminar">
                                <i class="bi bi-x-lg"></i>
                            </button>
                        </div>
                    </div>
                </div>`;
            }).join('');

            container.innerHTML = html;
        }

        // Actualizar totales
        const fmt = n => '$' + n.toLocaleString('es-CO');
        document.getElementById('posCartTotal').textContent = fmt(total);
        document.getElementById('posCobrarTotal').textContent = fmt(total);

        const btnCobrar = document.getElementById('posBtnCobrar');
        if (btnCobrar) btnCobrar.disabled = !cart.length;

        const btnAparcar = document.getElementById('posBtnAparcar');
        if (btnAparcar) btnAparcar.disabled = !cart.length;
    },

    // ─── Cliente ──────────────────────────────────────────────────
    setClienteUI(cliente) {
        const inp = document.getElementById('posClienteInput');
        const hid = document.getElementById('posClienteId');
        if (inp) inp.value = cliente.nombre;
        if (hid) hid.value = cliente.id;
    },

    renderClienteSugerencias(lista) {
        const dropdown = document.getElementById('posClienteSugerencias');
        if (!dropdown) return;

        if (!lista.length) {
            dropdown.style.display = 'none';
            return;
        }

        dropdown.innerHTML = lista.map(c => `
            <div class="pos-customer-item" onclick='POS_UI._seleccionarCliente(${JSON.stringify(c)})'>
                <span class="pci-name">${c.nombre}</span>
                <span class="pci-tel text-muted small">${c.telefono || ''}</span>
            </div>`).join('');
        dropdown.style.display = '';
    },

    _seleccionarCliente(cliente) {
        POS.setCliente(cliente);
        document.getElementById('posClienteSugerencias').style.display = 'none';
    },

    // ─── Stats ───────────────────────────────────────────────────
    renderStats() {
        const { num_ordenes, total_hoy } = POS.state.stats;
        const el1 = document.getElementById('posStatsOrdenes');
        const el2 = document.getElementById('posStatsTotal');
        if (el1) el1.textContent = num_ordenes || 0;
        if (el2) el2.textContent = '$' + Number(total_hoy || 0).toLocaleString('es-CO');
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

        // Guardamos los borradores en el DOM como atributo data-idx para evitar JSON inline
        POS_UI._borradoresCache = borradores;

        tbody.innerHTML = borradores.map((b, idx) => {
            const n = b.items.length;
            const total = Number(b.total).toLocaleString('es-CO');
            const hora = new Date(b.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
            return `<tr>
                <td>${b.nombre_cliente || 'Consumidor final'}</td>
                <td>${n} ítem${n !== 1 ? 's' : ''}</td>
                <td class="fw-semibold">$${total}</td>
                <td class="text-muted small">${hora}</td>
                <td>
                    <button class="btn btn-sm btn-primary me-1" data-borrador-idx="${idx}">
                        <i class="bi bi-arrow-up-circle me-1"></i>Cargar
                    </button>
                    <button class="btn btn-sm btn-outline-danger" data-borrador-del="${b.id}">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>`;
        }).join('');

        tbody.querySelectorAll('[data-borrador-idx]').forEach(btn => {
            btn.addEventListener('click', () => {
                const b = POS_UI._borradoresCache[parseInt(btn.dataset.borradorIdx)];
                if (b) POS.cargarBorrador(b);
            });
        });

        tbody.querySelectorAll('[data-borrador-del]').forEach(btn => {
            btn.addEventListener('click', () => POS_UI._eliminarBorrador(parseInt(btn.dataset.borradorDel), btn));
        });
    },

    async _eliminarBorrador(id, btn) {
        btn.disabled = true;
        await POS_API.deleteBorrador(id);
        await POS.recargarBorradores();
        POS_UI.renderBorradoresModal();
    }
};
