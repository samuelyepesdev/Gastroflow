const _qrPageData = (function () {
    const el = document.getElementById('qr-page-data');
    return el ? JSON.parse(el.textContent) : {};
})();
window.QR_TOKEN = _qrPageData.qrToken || '';

// Mapa producto_id -> grupos[] de modificadores/toppings (inyectado por el server)
const MODIFICADORES = (function () {
    const el = document.getElementById('qr-modificadores-data');
    try {
        return el ? JSON.parse(el.textContent) : {};
    } catch (_) {
        return {};
    }
})();

// Carrito basado en LÍNEAS: cada línea = producto + combinación de toppings + nota.
// key: `${producto_id}|${idsOpcionesOrdenados}|${nota}`
let cart = {};

// Estado del modal de personalización mientras está abierto.
let modalState = null;

function formatPrice(val) { return '$' + Number(val).toLocaleString('es-CO'); }

function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getCardData(id) {
    const card = document.querySelector(`.product-card[data-id="${id}"]`);
    if (!card) { return null; }
    return {
        id: String(id),
        nombre: card.dataset.nombre,
        precio: Number.parseFloat(card.dataset.precio) || 0,
        descripcion: card.dataset.descripcion || '',
        imagen: card.dataset.imagen || '',
        pideNota: card.dataset.pideNota === '1',
        grupos: MODIFICADORES[String(id)] || []
    };
}

function esProductoSimple(data) {
    return data && data.grupos.length === 0 && !data.pideNota;
}

function lineKey(productoId, seleccion, nota) {
    const ids = [];
    (seleccion || []).forEach(s => (s.opciones || []).forEach(o => ids.push(o)));
    ids.sort((a, b) => a - b);
    return `${productoId}|${ids.join(',')}|${(nota || '').trim()}`;
}

// ----- Alta de líneas -----

function addLine(data, seleccion, preview, nota, precioAdicional, qty) {
    const cantidad = qty || 1;
    const key = lineKey(data.id, seleccion, nota);
    if (cart[key]) {
        cart[key].qty += cantidad;
    } else {
        cart[key] = {
            key: key,
            producto_id: data.id,
            nombre: data.nombre,
            precioBase: data.precio,
            precioAdicional: precioAdicional || 0,
            qty: cantidad,
            seleccion: seleccion || [],
            preview: preview || [],
            nota: (nota || '').trim()
        };
    }
    updateUI();
}

// Botón "+" de la tarjeta: ruta rápida si el producto no tiene toppings ni nota
// obligatoria; si los tiene, abre el modal de personalización.
function addToCart(id) {
    const data = getCardData(id);
    if (!data) { return; }
    if (esProductoSimple(data)) {
        addLine(data, [], [], '', 0, 1);
        return;
    }
    openCustomizeModal(data);
}
window.addToCart = addToCart;

// Stepper de la tarjeta: solo aplica a productos simples (una única línea sin extras).
function updateCart(id, delta) {
    const key = lineKey(id, [], '');
    if (cart[key]) {
        cart[key].qty += delta;
        if (cart[key].qty <= 0) { delete cart[key]; }
    }
    updateUI();
}
window.updateCart = updateCart;

// Stepper por línea dentro del offcanvas (index-based para no meter la key en el HTML).
function updateLineIdx(idx, delta) {
    const line = (window._cartLines || [])[idx];
    if (!line || !cart[line.key]) { return; }
    cart[line.key].qty += delta;
    if (cart[line.key].qty <= 0) { delete cart[line.key]; }
    updateUI();
}
window.updateLineIdx = updateLineIdx;

// ----- Modal de personalización (detalle + toppings + nota + cantidad) -----

function showProductDetails(card, event) {
    if (event && (event.target.closest('.add-btn') || event.target.closest('.qty-controls'))) {
        return;
    }
    openCustomizeModal(getCardData(card.dataset.id));
}
window.showProductDetails = showProductDetails;

function openCustomizeModal(data) {
    if (!data) { return; }
    modalState = { data: data, qty: 1 };

    document.getElementById('modalProductName').textContent = data.nombre;
    document.getElementById('modalProductPrice').textContent = formatPrice(data.precio);

    const descWrap = document.getElementById('modalProductDescWrap');
    const descEl = document.getElementById('modalProductDesc');
    if (data.descripcion && data.descripcion.trim() !== '') {
        descEl.textContent = data.descripcion;
        descWrap.classList.remove('d-none');
    } else {
        descEl.textContent = '';
        descWrap.classList.add('d-none');
    }

    const imgEl = document.getElementById('modalProductImg');
    const placeholderEl = document.getElementById('modalProductImgPlaceholder');
    if (data.imagen && data.imagen.trim() !== '') {
        imgEl.src = data.imagen;
        imgEl.classList.remove('d-none');
        placeholderEl.classList.add('d-none');
    } else {
        imgEl.src = '';
        imgEl.classList.add('d-none');
        placeholderEl.classList.remove('d-none');
    }

    renderModalGroups(data.grupos);

    const notaInput = document.getElementById('qrModNota');
    notaInput.value = '';
    document.getElementById('qrModNotaLabel').textContent = data.pideNota
        ? 'Nota para cocina (obligatoria)'
        : 'Nota para cocina (opcional)';
    notaInput.oninput = updateModalTotal;

    modalState.qty = 1;
    document.getElementById('qrModQty').textContent = '1';

    updateModalTotal();
    new bootstrap.Modal(document.getElementById('productDetailModal')).show();
}

function renderModalGroups(grupos) {
    const cont = document.getElementById('qrModGroups');
    if (!grupos || grupos.length === 0) {
        cont.innerHTML = '';
        return;
    }

    cont.innerHTML = grupos.map(g => {
        const inputType = g.tipo_seleccion === 'multiple' ? 'checkbox' : 'radio';
        const badge = g.obligatorio
            ? '<span class="qr-mod-badge req">Obligatorio</span>'
            : '<span class="qr-mod-badge opt">Opcional</span>';
        let sub = 'Elige 1';
        if (g.tipo_seleccion === 'multiple') {
            sub = g.maximo_selecciones ? `Elige hasta ${g.maximo_selecciones}` : 'Elige las que quieras';
        }
        const opciones = (g.opciones || []).map(o => `
            <label class="qr-mod-opcion">
                <span class="qr-mod-opcion-nombre">
                    <input type="${inputType}" name="qr-grupo-${g.id}" value="${o.id}"
                        data-precio="${o.precio_adicional}" data-nombre="${escapeHtml(o.nombre)}">
                    <span>${escapeHtml(o.nombre)}</span>
                </span>
                <span class="qr-mod-opcion-precio">${Number(o.precio_adicional) > 0 ? '+' + formatPrice(o.precio_adicional) : ''}</span>
            </label>`).join('');
        return `
            <div class="qr-mod-grupo" data-grupo-id="${g.id}" data-tipo="${g.tipo_seleccion}"
                 data-obligatorio="${g.obligatorio ? 1 : 0}" data-minimo="${g.minimo_selecciones || 0}"
                 data-maximo="${g.maximo_selecciones || 0}">
                <div class="qr-mod-grupo-head"><strong>${escapeHtml(g.nombre)}</strong> ${badge}</div>
                <div class="qr-mod-grupo-sub">${sub}</div>
                ${opciones}
            </div>`;
    }).join('');

    cont.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(inp => {
        // Los navegadores restauran el "checked" previo cuando el innerHTML reutiliza el
        // mismo name+type (grupos compartidos entre productos): forzamos estado limpio.
        inp.checked = false;
        inp.addEventListener('change', () => {
            enforceGroupLimits(inp);
            updateModalTotal();
        });
    });
}

// Para grupos de selección múltiple con tope: deshabilita las casillas no marcadas
// al llegar al máximo.
function enforceGroupLimits(changedInput) {
    const grupo = changedInput.closest('.qr-mod-grupo');
    if (!grupo || grupo.dataset.tipo !== 'multiple') { return; }
    const max = Number.parseInt(grupo.dataset.maximo, 10) || 0;
    if (max <= 0) { return; }
    const checks = grupo.querySelectorAll('input[type="checkbox"]');
    const marcados = grupo.querySelectorAll('input[type="checkbox"]:checked').length;
    checks.forEach(c => { c.disabled = !c.checked && marcados >= max; });
}

function collectModalSeleccion() {
    const seleccion = [];
    const preview = [];
    let precioAdicional = 0;
    document.querySelectorAll('#qrModGroups .qr-mod-grupo').forEach(div => {
        const grupoId = Number.parseInt(div.dataset.grupoId, 10);
        const opciones = [];
        div.querySelectorAll('input:checked').forEach(inp => {
            opciones.push(Number.parseInt(inp.value, 10));
            const p = Number.parseFloat(inp.dataset.precio) || 0;
            precioAdicional += p;
            preview.push({ opcion_nombre: inp.dataset.nombre, precio_adicional: p });
        });
        if (opciones.length > 0) { seleccion.push({ grupo_id: grupoId, opciones: opciones }); }
    });
    return { seleccion: seleccion, preview: preview, precioAdicional: precioAdicional };
}

function modalEsValido() {
    let ok = true;
    document.querySelectorAll('#qrModGroups .qr-mod-grupo').forEach(div => {
        const marcados = div.querySelectorAll('input:checked').length;
        const minimo = Number.parseInt(div.dataset.minimo, 10) || 0;
        if (div.dataset.obligatorio === '1') {
            if (marcados < Math.max(1, minimo)) { ok = false; }
        } else if (minimo > 0 && marcados > 0 && marcados < minimo) {
            ok = false;
        }
    });
    if (modalState && modalState.data.pideNota && !document.getElementById('qrModNota').value.trim()) {
        ok = false;
    }
    return ok;
}

function updateModalTotal() {
    const { precioAdicional } = collectModalSeleccion();
    const qty = (modalState && modalState.qty) || 1;
    const base = (modalState && modalState.data.precio) || 0;
    document.getElementById('modalAddTotal').textContent = formatPrice((base + precioAdicional) * qty);
    document.getElementById('modalAddBtn').disabled = !modalEsValido();
}

// ----- Render general -----

function updateUI() {
    let total = 0;
    let count = 0;
    const qtyPorProducto = {};

    Object.values(cart).forEach(line => {
        total += (line.precioBase + line.precioAdicional) * line.qty;
        count += line.qty;
        qtyPorProducto[line.producto_id] = (qtyPorProducto[line.producto_id] || 0) + line.qty;
    });

    document.querySelectorAll('.product-card').forEach(card => {
        const addBtn = card.querySelector('.add-btn');
        const ctrl = card.querySelector('.qty-controls');
        const val = card.querySelector('.qty-value');
        const pid = card.dataset.id;
        const q = qtyPorProducto[pid] || 0;

        if (addBtn) {
            addBtn.style.display = 'flex';
            const oldBadge = addBtn.querySelector('.qr-add-count');
            if (oldBadge) { oldBadge.remove(); }
        }
        if (ctrl) { ctrl.classList.remove('active'); }
        if (val) { val.textContent = '0'; }
        if (q === 0) { return; }

        const data = getCardData(pid);
        if (esProductoSimple(data) && ctrl && val && addBtn) {
            addBtn.style.display = 'none';
            ctrl.classList.add('active');
            val.textContent = q;
        } else if (addBtn) {
            const badge = document.createElement('span');
            badge.className = 'qr-add-count';
            badge.textContent = q;
            addBtn.appendChild(badge);
        }
    });

    const bar = document.getElementById('bottomCart');
    if (count > 0) {
        bar.classList.add('show');
        document.getElementById('cartTotal').textContent = formatPrice(total);
        document.getElementById('cartItems').textContent = `${count} producto${count > 1 ? 's' : ''}`;
    } else {
        bar.classList.remove('show');
        bootstrap.Offcanvas.getInstance(document.getElementById('cartOffcanvas'))?.hide();
    }

    renderOffcanvasList(total);
}

function renderOffcanvasList(total) {
    const list = document.getElementById('cartList');
    const lines = Object.values(cart);
    window._cartLines = lines;

    if (lines.length === 0) {
        list.innerHTML = '<p class="text-center text-muted py-4 mb-0">Tu pedido está vacío</p>';
    } else {
        list.innerHTML = lines.map((item, idx) => {
            const toppings = (item.preview || []).map(p => p.opcion_nombre).join(', ');
            const unit = item.precioBase + item.precioAdicional;
            return `
                <div class="cart-item">
                    <div style="flex-grow: 1; padding-right: 12px;">
                        <div class="cart-item-name">${escapeHtml(item.nombre)}</div>
                        ${toppings ? `<div class="cart-item-extra">${escapeHtml(toppings)}</div>` : ''}
                        ${item.nota ? `<div class="cart-item-nota"><i class="bi bi-chat-left-text me-1"></i>${escapeHtml(item.nota)}</div>` : ''}
                        <div class="cart-item-price">${formatPrice(unit)}</div>
                    </div>
                    <div class="qty-controls active" style="position: static; background: #f0f2f5; box-shadow: none;">
                        <button class="qty-btn text-danger" onclick="updateLineIdx(${idx}, -1)"><i class="bi bi-dash"></i></button>
                        <span class="qty-value">${item.qty}</span>
                        <button class="qty-btn" style="color: var(--primary-color);" onclick="updateLineIdx(${idx}, 1)"><i class="bi bi-plus"></i></button>
                    </div>
                </div>`;
        }).join('');
    }
    document.getElementById('offcanvasTotal').textContent = formatPrice(total);
}

// ----- Init -----

document.addEventListener('DOMContentLoaded', function () {
    // Scrollspy de categorías
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = entry.target.id.replace('cat-', '');
                document.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
                const activePill = document.querySelector(`.category-pill[data-id="${id}"]`);
                if (activePill) {
                    activePill.classList.add('active');
                    const scrollMenu = document.getElementById('catScroll');
                    scrollMenu.scrollTo({
                        left: activePill.offsetLeft - (scrollMenu.clientWidth / 2) + (activePill.clientWidth / 2),
                        behavior: 'smooth'
                    });
                }
            }
        });
    }, { rootMargin: '-100px 0px -60% 0px' });
    document.querySelectorAll('.category-section').forEach(sec => observer.observe(sec));

    // Modal: cantidad
    document.getElementById('qrModQtyMinus')?.addEventListener('click', () => {
        if (!modalState) { return; }
        modalState.qty = Math.max(1, modalState.qty - 1);
        document.getElementById('qrModQty').textContent = modalState.qty;
        updateModalTotal();
    });
    document.getElementById('qrModQtyPlus')?.addEventListener('click', () => {
        if (!modalState) { return; }
        modalState.qty = Math.min(50, modalState.qty + 1);
        document.getElementById('qrModQty').textContent = modalState.qty;
        updateModalTotal();
    });

    // Modal: agregar al pedido
    document.getElementById('modalAddBtn')?.addEventListener('click', () => {
        if (!modalState || !modalEsValido()) { return; }
        const { seleccion, preview, precioAdicional } = collectModalSeleccion();
        const nota = document.getElementById('qrModNota').value.trim();
        addLine(modalState.data, seleccion, preview, nota, precioAdicional, modalState.qty);
        bootstrap.Modal.getInstance(document.getElementById('productDetailModal'))?.hide();
    });

    // Enviar pedido
    document.getElementById('btnEnviarPedido')?.addEventListener('click', async () => {
        const lines = Object.values(cart);
        if (lines.length === 0) { return; }

        const btn = document.getElementById('btnEnviarPedido');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Procesando...';

        const items = lines.map(l => ({
            producto_id: l.producto_id,
            cantidad: l.qty,
            nota: l.nota || null,
            modificadores: l.seleccion || []
        }));
        const notas = document.getElementById('pedidoNotas').value.trim();

        try {
            const res = await fetch(`/api/qr/pedidos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ qr_token: window.QR_TOKEN, items, notas })
            });

            const data = await res.json();
            if (!res.ok) { throw new Error(data.error || 'No se pudo enviar el pedido.'); }

            const numero = data && data.data && data.data.numero;
            Swal.fire({
                icon: 'success',
                title: numero ? `¡Pedido #${numero} confirmado!` : '¡Pedido Confirmado!',
                text: 'El mesero validará tu orden en unos instantes.',
                confirmButtonColor: 'var(--primary-color)',
                confirmButtonText: 'Genial, gracias'
            }).then(() => {
                cart = {};
                document.getElementById('pedidoNotas').value = '';
                updateUI();
            });
        } catch (err) {
            Swal.fire({ icon: 'error', title: 'Oops...', text: err.message });
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    });

    // Ocultar carrito flotante cuando el Offcanvas está abierto
    const cartOffcanvas = document.getElementById('cartOffcanvas');
    if (cartOffcanvas) {
        cartOffcanvas.addEventListener('show.bs.offcanvas', () => {
            document.getElementById('bottomCart').style.visibility = 'hidden';
            document.getElementById('bottomCart').style.opacity = '0';
        });
        cartOffcanvas.addEventListener('hidden.bs.offcanvas', () => {
            document.getElementById('bottomCart').style.visibility = 'visible';
            document.getElementById('bottomCart').style.opacity = '1';
        });
    }
});
