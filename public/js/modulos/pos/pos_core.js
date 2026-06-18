// POS Core — estado central y operaciones del carrito

window.POS = {
    state: {
        productos: [],
        categorias: [],
        filtrados: [],
        cart: [],
        cliente: null,
        catActiva: 'all',
        borradores: [],
        stats: { num_ordenes: 0, total_hoy: 0 }
    },

    // ─── Inicialización ────────────────────────────────────────────
    async init() {
        const dataEl = document.getElementById('posInitData');
        if (dataEl) {
            try {
                const { productos, categorias } = JSON.parse(dataEl.textContent);
                this.state.productos = productos || [];
                this.state.categorias = categorias || [];
                this.state.filtrados = [...this.state.productos];
                // Mapa para acceso rápido por ID (evita pasar JSON en onclick)
                this.state.productosMap = new Map(this.state.productos.map(p => [p.id, p]));
            } catch (_) {}
        }

        POS_UI.renderCats();
        POS_UI.renderCatalogo();
        POS_UI.renderCart();

        // Consumidor final por defecto
        POS_API.getOrCreateConsumidorFinal().then(cf => {
            if (cf && !this.state.cliente) {
                this.setCliente(cf);
            }
        });

        await Promise.all([this.recargarBorradores(), this.recargarStats()]);

        this._bindEvents();
    },

    // ─── Carrito ──────────────────────────────────────────────────
    addToCart(productoId) {
        const producto = this.state.productosMap?.get(productoId);
        if (!producto) return;

        const existing = this.state.cart.find(i => i.producto_id === producto.id);
        if (existing) {
            existing.cantidad++;
        } else {
            const precio = parseFloat(producto.precio_unidad) || 0;
            this.state.cart.push({
                producto_id: producto.id,
                nombre: producto.nombre,
                precio,
                precio_original: precio,
                cantidad: 1,
                descuento_porcentaje: 0,
                unidad: 'UND'
            });
        }
        POS_UI.renderCart();
        POS_UI.flashCard(producto.id);
    },

    removeFromCart(idx) {
        this.state.cart.splice(idx, 1);
        POS_UI.renderCart();
    },

    updateQty(idx, qty) {
        const item = this.state.cart[idx];
        if (!item) return;
        if (qty <= 0) {
            this.removeFromCart(idx);
        } else {
            item.cantidad = qty;
            POS_UI.renderCart();
        }
    },

    setDescuento(idx, pct) {
        const item = this.state.cart[idx];
        if (!item) return;
        item.descuento_porcentaje = Math.min(Math.max(parseFloat(pct) || 0, 0), 100);
        POS_UI.renderCart();
    },

    clearCart() {
        this.state.cart = [];
        this.state.cliente = null;
        POS_UI.renderCart();
        POS_API.getOrCreateConsumidorFinal().then(cf => cf && this.setCliente(cf));
    },

    // ─── Totales ──────────────────────────────────────────────────
    itemSubtotal(item) {
        return item.cantidad * item.precio * (1 - (item.descuento_porcentaje || 0) / 100);
    },

    getTotal() {
        return this.state.cart.reduce((sum, item) => sum + this.itemSubtotal(item), 0);
    },

    // ─── Cliente ──────────────────────────────────────────────────
    setCliente(cliente) {
        this.state.cliente = cliente;
        POS_UI.setClienteUI(cliente);
    },

    // ─── Filtros del catálogo ─────────────────────────────────────
    setCategoria(catId) {
        this.state.catActiva = catId;
        this._aplicarFiltros();
    },

    buscar(query) {
        this.state.searchQuery = query;
        this._aplicarFiltros();
    },

    _aplicarFiltros() {
        const { catActiva, searchQuery, productos } = this.state;
        let list = [...productos];

        if (catActiva && catActiva !== 'all') {
            list = list.filter(p => String(p.categoria_id) === String(catActiva));
        }

        if (searchQuery && searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            list = list.filter(p =>
                p.nombre.toLowerCase().includes(q) ||
                (p.codigo && p.codigo.toLowerCase().includes(q))
            );
        }

        this.state.filtrados = list;
        POS_UI.renderCatalogo();
    },

    // ─── Borradores (órdenes guardadas) ──────────────────────────
    async recargarBorradores() {
        this.state.borradores = await POS_API.getBorradores();
        POS_UI.updateBorradoresCount();
    },

    async guardarOrden() {
        if (!this.state.cart.length) return;
        const clienteNombre = document.getElementById('posClienteInput')?.value || 'Consumidor final';
        const clienteId = this.state.cliente?.id || null;

        await POS_API.saveBorrador({
            cliente_id: clienteId,
            nombre_cliente: clienteNombre,
            items: this.state.cart,
            total: this.getTotal()
        });

        this.clearCart();
        await this.recargarBorradores();

        Swal.fire({ icon: 'success', title: 'Orden guardada', timer: 1300, showConfirmButton: false });
    },

    async cargarBorrador(borrador) {
        this.state.cart = borrador.items.map(i => ({ ...i }));
        if (borrador.cliente_id) {
            this.setCliente({ id: borrador.cliente_id, nombre: borrador.nombre_cliente });
        }
        POS_UI.renderCart();
        await POS_API.deleteBorrador(borrador.id);
        await this.recargarBorradores();
        bootstrap.Modal.getInstance(document.getElementById('posBorradoresModal'))?.hide();
    },

    // ─── Stats ───────────────────────────────────────────────────
    async recargarStats() {
        this.state.stats = await POS_API.getStats();
        POS_UI.renderStats();
    },

    // ─── Eventos del DOM ─────────────────────────────────────────
    _bindEvents() {
        // Búsqueda
        let searchTimer;
        document.getElementById('posSearch')?.addEventListener('input', e => {
            const val = e.target.value;
            document.getElementById('posClearSearch').style.display = val ? '' : 'none';
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => POS.buscar(val), 200);
        });

        document.getElementById('posClearSearch')?.addEventListener('click', () => {
            document.getElementById('posSearch').value = '';
            document.getElementById('posClearSearch').style.display = 'none';
            POS.buscar('');
        });

        // Botón Cobrar
        document.getElementById('posBtnCobrar')?.addEventListener('click', () => {
            if (!POS.state.cart.length) return;
            POS_PAGO.abrirModal();
        });

        // Botón Guardar orden (aparcar)
        document.getElementById('posBtnAparcar')?.addEventListener('click', () => {
            if (!POS.state.cart.length) {
                Swal.fire({ icon: 'info', title: 'El carrito está vacío', timer: 1200, showConfirmButton: false });
                return;
            }
            POS.guardarOrden();
        });

        // Botón Limpiar
        document.getElementById('posBtnLimpiar')?.addEventListener('click', () => {
            if (!POS.state.cart.length) return;
            Swal.fire({
                title: '¿Limpiar la orden?',
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Sí, limpiar',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#dc3545'
            }).then(r => r.isConfirmed && POS.clearCart());
        });

        // Botón Órdenes guardadas
        document.getElementById('posBtnBorradores')?.addEventListener('click', () => {
            POS_UI.renderBorradoresModal();
            new bootstrap.Modal(document.getElementById('posBorradoresModal')).show();
        });

        // Búsqueda de cliente
        let clienteTimer;
        document.getElementById('posClienteInput')?.addEventListener('input', e => {
            const val = e.target.value.trim();
            clearTimeout(clienteTimer);
            if (val.length < 2) {
                document.getElementById('posClienteSugerencias').style.display = 'none';
                return;
            }
            clienteTimer = setTimeout(async () => {
                const lista = await POS_API.buscarCliente(val);
                POS_UI.renderClienteSugerencias(lista);
            }, 300);
        });

        document.addEventListener('click', e => {
            if (!e.target.closest('.pos-customer-input-wrap')) {
                document.getElementById('posClienteSugerencias').style.display = 'none';
            }
        });

        // Guardar nuevo cliente
        document.getElementById('posGuardarClienteBtn')?.addEventListener('click', async () => {
            const nombre = document.getElementById('posNuevoClienteNombre')?.value.trim();
            if (!nombre) return Swal.fire('Atención', 'El nombre es obligatorio', 'warning');

            const btn = document.getElementById('posGuardarClienteBtn');
            btn.disabled = true;
            try {
                const cliente = await POS_API.crearCliente({
                    nombre,
                    telefono: document.getElementById('posNuevoClienteTel')?.value.trim() || null,
                    direccion: document.getElementById('posNuevoClienteDir')?.value.trim() || null
                });
                POS.setCliente(cliente);
                bootstrap.Modal.getInstance(document.getElementById('posNuevoClienteModal'))?.hide();
                document.getElementById('posFormNuevoCliente')?.reset();
                Swal.fire({ icon: 'success', title: 'Cliente creado', timer: 1300, showConfirmButton: false });
            } catch (err) {
                Swal.fire('Error', err.message, 'error');
            } finally {
                btn.disabled = false;
            }
        });

        // Nueva venta desde modal recibo
        document.getElementById('posReceiptNuevaVenta')?.addEventListener('click', () => {
            POS.clearCart();
            POS.recargarStats();
        });
    }
};

// Auto-init al cargar la página
document.addEventListener('DOMContentLoaded', () => POS.init());
