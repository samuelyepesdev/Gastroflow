let cart = {}; 

function formatPrice(val) { return '$' + Number(val).toLocaleString('es-CO'); }

function addToCart(id) {
    const card = document.querySelector(`.product-card[data-id="${id}"]`);
    cart[id] = {
        id: id,
        nombre: card.getAttribute('data-nombre'),
        precio: parseFloat(card.getAttribute('data-precio')),
        qty: 1
    };
    updateUI();
}

function updateCart(id, delta) {
    if (cart[id]) {
        cart[id].qty += delta;
        if (cart[id].qty <= 0) delete cart[id];
    }
    updateUI();
}

function updateUI() {
    let total = 0;
    let count = 0;
    
    document.querySelectorAll('.add-btn').forEach(btn => btn.style.display = 'flex');
    document.querySelectorAll('.qty-controls').forEach(ctrl => ctrl.classList.remove('active'));

    Object.values(cart).forEach(item => {
        total += item.precio * item.qty;
        count += item.qty;
        
        const btnAdd = document.querySelector(`.product-card[data-id="${item.id}"] .add-btn`);
        const ctrl = document.getElementById(`qty-${item.id}`);
        const val = document.getElementById(`val-${item.id}`);
        
        if(btnAdd && ctrl && val) {
            btnAdd.style.display = 'none';
            ctrl.classList.add('active');
            val.innerText = item.qty;
        }
    });

    const bar = document.getElementById('bottomCart');
    if (count > 0) {
        bar.classList.add('show');
        document.getElementById('cartTotal').innerText = formatPrice(total);
        document.getElementById('cartItems').innerText = `${count} producto${count > 1 ? 's' : ''}`;
    } else {
        bar.classList.remove('show');
        bootstrap.Offcanvas.getInstance(document.getElementById('cartOffcanvas'))?.hide();
    }

    renderOffcanvasList(total);
}

function renderOffcanvasList(total) {
    const list = document.getElementById('cartList');
    list.innerHTML = '';
    
    Object.values(cart).forEach(item => {
        list.innerHTML += `
            <div class="cart-item">
                <div style="flex-grow: 1;">
                    <div class="cart-item-name">${item.nombre}</div>
                    <div class="cart-item-price">${formatPrice(item.precio)}</div>
                </div>
                <div class="qty-controls active" style="position: static; background: #f0f2f5; box-shadow: none;">
                    <button class="qty-btn text-danger" onclick="updateCart('${item.id}', -1)"><i class="bi bi-dash"></i></button>
                    <span class="qty-value">${item.qty}</span>
                    <button class="qty-btn" style="color: var(--primary-color);" onclick="updateCart('${item.id}', 1)"><i class="bi bi-plus"></i></button>
                </div>
            </div>
        `;
    });
    document.getElementById('offcanvasTotal').innerText = formatPrice(total);
}

// Scrollspy Categories Sync
document.addEventListener("DOMContentLoaded", function() {
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

    // Submit Order
    document.getElementById('btnEnviarPedido')?.addEventListener('click', async () => {
        if (Object.keys(cart).length === 0) return;
        
        const btn = document.getElementById('btnEnviarPedido');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Procesando...';

        const items = Object.values(cart).map(i => ({ producto_id: i.id, cantidad: i.qty }));
        const notas = document.getElementById('pedidoNotas').value.trim();

        try {
            const res = await fetch(`/api/qr/pedidos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ qr_token: window.QR_TOKEN, items, notas })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'No se pudo enviar el pedido.');

            Swal.fire({
                icon: 'success',
                title: '¡Pedido Confirmado!',
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
});
