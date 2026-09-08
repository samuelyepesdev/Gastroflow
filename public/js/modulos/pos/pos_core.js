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
        stats: { num_ordenes: 0, total_hoy: 0 },
        // Pedido/mesa "de cocina" ya creado para esta orden (si viene de un borrador
        // que se guardó antes, ver guardarOrden/cargarBorrador). Se cierra al cobrar.
        pedidoCocinaId: null,
        mesaCocinaId: null,
        // Id del borrador cargado al carrito (si viene de "Órdenes guardadas"). Se usa
        // para actualizar esa misma fila al guardar de nuevo, y para borrarla al cobrar.
        borradorId: null
    },

    // ─── Inicialización ────────────────────────────────────────────
    async init() {
        this._setupColors();

        const dataEl = document.getElementById('posInitData');
        if (dataEl) {
            try {
                const { productos, categorias } = JSON.parse(dataEl.textContent);
                this.state.productos = productos || [];
                this.state.categorias = categorias || [];
                this.state.filtrados = [...this.state.productos];
                this.state.productosMap = new Map(this.state.productos.map(p => [p.id, p]));
            } catch (err) {
                console.error('No se pudo leer los datos iniciales del POS:', err);
            }
        }

        POS_UI.renderCats();
        POS_UI.renderCatalogo();
        POS_UI.renderCart();

        // Consumidor final por defecto
        POS_API.getOrCreateConsumidorFinal().then(cf => {
            if (cf?.id && !this.state.cliente) {
                this.setCliente(cf);
            }
        }).catch(() => {});

        await Promise.all([this.recargarBorradores(), this.recargarStats()]);

        this._bindEvents();
    },

    // Calcula variantes oscura/suave del color de acento y las aplica como CSS vars
    _setupColors() {
        const accent = document.body.style.getPropertyValue('--pos-accent').trim() || '#6366f1';

        const hx = h => {
            h = h.replace('#', '').trim();
            if (h.length === 3) h = h.split('').map(c => c + c).join('');
            return [Number.parseInt(h.slice(0,2),16), Number.parseInt(h.slice(2,4),16), Number.parseInt(h.slice(4,6),16)];
        };
        const toHex = a => '#' + a.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2,'0')).join('');
        const mix = (a, b, t) => { const A = hx(a), B = hx(b); return toHex([0,1,2].map(i => A[i] + (B[i] - A[i]) * t)); };

        document.documentElement.style.setProperty('--pos-accent-soft', mix(accent, '#ffffff', 0.88));
        document.documentElement.style.setProperty('--pos-accent-softer', mix(accent, '#ffffff', 0.95));
        this._accentColor = accent;
    },

    // ─── Carrito ──────────────────────────────────────────────────
    // Punto de entrada al hacer click en una tarjeta de producto: si tiene grupos
    // de modificadores/toppings configurados, POS_MODIFICADORES abre el modal de
    // selección; si no, agrega directo (ver agregarSimple), sin fricción extra.
    addToCart(productoId) {
        const producto = this.state.productosMap?.get(productoId);
        if (!producto) return;
        POS_MODIFICADORES.abrir(producto);
    },

    // Agrega un producto sin modificadores (comportamiento de siempre).
    agregarSimple(producto) {
        const existing = this.state.cart.find(i => i.producto_id === producto.id && !i.modificadores_hash);
        if (existing) {
            existing.cantidad++;
        } else {
            const precio = Number.parseFloat(producto.precio_unidad) || 0;
            this.state.cart.push({
                producto_id: producto.id,
                nombre: producto.nombre,
                precio,
                precio_original: precio,
                cantidad: 1,
                descuento_porcentaje: 0,
                descuento_valor: 0,
                categoria_id: producto.categoria_id,
                unidad: 'UND',
                modificadores_seleccion: [],
                modificadores_preview: [],
                modificadores_total: 0,
                modificadores_hash: null
            });
        }
        POS_UI.renderCart();
        POS_UI.flashCard(producto.id);
    },

    // Agrega un producto con toppings elegidos. Dos líneas del mismo producto con
    // distintos toppings NO se fusionan (distinto modificadores_hash); con los
    // mismos toppings sí suman cantidad.
    addToCartConModificadores(producto, seleccion, preview, totalAdicional) {
        const hash = seleccion.flatMap(s => s.opciones).sort((a, b) => a - b).join(',') || null;
        const existing = this.state.cart.find(i => i.producto_id === producto.id && i.modificadores_hash === hash);
        if (existing) {
            existing.cantidad++;
        } else {
            const precio = Number.parseFloat(producto.precio_unidad) || 0;
            this.state.cart.push({
                producto_id: producto.id,
                nombre: producto.nombre,
                precio,
                precio_original: precio,
                cantidad: 1,
                descuento_porcentaje: 0,
                descuento_valor: 0,
                categoria_id: producto.categoria_id,
                unidad: 'UND',
                modificadores_seleccion: seleccion,
                modificadores_preview: preview,
                modificadores_total: totalAdicional,
                modificadores_hash: hash
            });
        }
        POS_UI.renderCart();
        POS_UI.flashCard(producto.id);
    },

    // Agrega un servicio (ej. domicilio) como línea del carrito -- sin modificadores,
    // no va a cocina (POSService._resolverItems filtra es_servicio antes de enviar).
    agregarServicio(servicio) {
        const precio = Number.parseFloat(servicio.precio) || 0;
        this.state.cart.push({
            producto_id: null,
            servicio_id: servicio.id,
            es_servicio: true,
            nombre: servicio.nombre,
            precio,
            precio_original: precio,
            cantidad: 1,
            descuento_porcentaje: 0,
            descuento_valor: 0,
            unidad: 'SERV',
            modificadores_seleccion: [],
            modificadores_preview: [],
            modificadores_total: 0,
            modificadores_hash: null
        });
        POS_UI.renderCart();
        bootstrap.Modal.getInstance(document.getElementById('posServiciosModal'))?.hide();
    },

    // Aplica una corrección de toppings sobre una línea ya existente del carrito (ver
    // POS_MODIFICADORES.editar). A diferencia de addToCartConModificadores, nunca crea
    // una línea nueva ni fusiona con otra -- solo actualiza esta.
    actualizarModificadoresCarrito(idx, seleccion, preview, totalAdicional) {
        const item = this.state.cart[idx];
        if (!item) return;
        item.modificadores_seleccion = seleccion;
        item.modificadores_preview = preview;
        item.modificadores_total = totalAdicional;
        item.modificadores_hash = seleccion.flatMap(s => s.opciones).sort((a, b) => a - b).join(',') || null;
        POS_UI.renderCart();
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

    // desc: número (retrocompat = %) o { tipo: 'porcentaje'|'valor', valor: N }
    setDescuento(idx, desc) {
        const item = this.state.cart[idx];
        if (!item) return;
        const obj = typeof desc === 'object' && desc !== null ? desc : { tipo: 'porcentaje', valor: desc };
        const valor = Math.max(Number.parseFloat(obj.valor) || 0, 0);
        if (obj.tipo === 'valor') {
            item.descuento_valor = Math.min(valor, item.cantidad * item.precio);
            item.descuento_porcentaje = 0;
        } else {
            item.descuento_porcentaje = Math.min(valor, 100);
            item.descuento_valor = 0;
        }
        POS_UI.renderCart();
    },

    clearCart() {
        this.state.cart = [];
        this.state.cliente = null;
        this.state.pedidoCocinaId = null;
        this.state.mesaCocinaId = null;
        this.state.borradorId = null;
        POS_UI.renderCart();
        // Restaurar cliente por defecto
        const inputEl = document.getElementById('posClienteInput');
        const idEl = document.getElementById('posClienteId');
        if (inputEl) inputEl.value = '';
        if (idEl) idEl.value = '';
        POS_API.getOrCreateConsumidorFinal().then(cf => {
            if (cf?.id) this.setCliente(cf);
        }).catch(() => {});
    },

    // ─── Totales ──────────────────────────────────────────────────
    itemSubtotal(item) {
        const bruto = item.cantidad * item.precio;
        const base = item.descuento_valor > 0
            ? Math.max(0, bruto - item.descuento_valor)
            : bruto * (1 - (item.descuento_porcentaje || 0) / 100);
        const adicionales = item.cantidad * (item.modificadores_total || 0);
        return base + adicionales;
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

        if (searchQuery?.trim()) {
            const q = searchQuery.toLowerCase().trim();
            list = list.filter(p =>
                p.nombre.toLowerCase().includes(q) ||
                p.codigo?.toLowerCase().includes(q)
            );
        }

        this.state.filtrados = list;
        POS_UI.renderCatalogo();
    },

    // ─── Borradores (órdenes guardadas) ──────────────────────────
    async recargarBorradores() {
        try {
            this.state.borradores = await POS_API.getBorradores();
        } catch (_) {
            this.state.borradores = [];
        }
        POS_UI.updateBorradoresCount();
    },

    async guardarOrden() {
        if (!this.state.cart.length) return;

        const nombreActual = document.getElementById('posClienteInput')?.value?.trim() || '';
        const { value: nombreIngresado, isConfirmed } = await Swal.fire({
            title: '<i class="bi bi-tag me-2"></i>Nombre del pedido',
            html: '<p class="text-muted small mb-0">Se mostrará en cocina para identificar este pedido. Puedes dejarlo en blanco.</p>',
            input: 'text',
            inputValue: nombreActual,
            inputPlaceholder: 'Ej: Juan Pérez',
            showCancelButton: true,
            confirmButtonText: 'Continuar <i class="bi bi-arrow-right-short"></i>',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#198754'
        });
        if (!isConfirmed) return;

        const clienteNombre = (nombreIngresado || '').trim() || 'Consumidor final';
        const clienteId = this.state.cliente?.id || null;

        try {
            // Al guardar, la orden se envía a cocina con el nombre del cliente (ver
            // POSService.saveBorrador). Si el carrito ya venía de un borrador cargado
            // (ya enviado antes), se reutiliza el mismo pedido en vez de duplicarlo.
            await POS_API.saveBorrador({
                cliente_id: clienteId,
                nombre_cliente: clienteNombre,
                items: this.state.cart,
                total: this.getTotal(),
                pedido_cocina_id: this.state.pedidoCocinaId || null,
                mesa_cocina_id: this.state.mesaCocinaId || null,
                borrador_id: this.state.borradorId || null
            });
            this.clearCart();
            await this.recargarBorradores();
            Swal.fire({ icon: 'success', title: 'Orden guardada y enviada a cocina', timer: 1500, showConfirmButton: false });
        } catch (err) {
            Swal.fire('Error', err.message || 'No se pudo guardar la orden', 'error');
        }
    },

    async cargarBorrador(borrador) {
        if (this.state.cart.length && this.state.borradorId !== borrador.id) {
            const { isConfirmed } = await Swal.fire({
                title: '¿Reemplazar el carrito actual?',
                text: 'Tienes una orden sin guardar en el carrito. Si cargas esta, se perderá.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Sí, reemplazar',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#dc3545'
            });
            if (!isConfirmed) return;
        }

        this.state.cart = borrador.items.map(i => ({ ...i }));
        this.state.pedidoCocinaId = borrador.pedido_cocina_id || null;
        this.state.mesaCocinaId = borrador.mesa_cocina_id || null;
        // Ya NO se borra el borrador de la BD al cargarlo (antes se hacía "skipCocina"
        // y solo quedaba vivo en memoria del navegador -- si algo interrumpía al cajero
        // antes de volver a guardar o cobrar, la orden se perdía por completo). Se
        // mantiene en la BD; guardarOrden lo actualiza en el sitio y el cobro lo borra.
        this.state.borradorId = borrador.id;
        if (borrador.cliente_id) {
            this.setCliente({ id: borrador.cliente_id, nombre: borrador.nombre_cliente });
        }
        POS_UI.renderCart();
        POS_UI.updateBorradoresCount();
        bootstrap.Modal.getInstance(document.getElementById('posBorradoresModal'))?.hide();
    },

    // ─── Stats ───────────────────────────────────────────────────
    async recargarStats() {
        try {
            this.state.stats = await POS_API.getStats();
        } catch (err) {
            console.warn('No se pudo cargar estadísticas del POS:', err);
        }
        POS_UI.renderStats();
    },

    // ─── Eventos del DOM ─────────────────────────────────────────
    _bindEvents() {
        let searchTimer;
        document.getElementById('posSearch')?.addEventListener('input', e => {
            const val = e.target.value;
            const clearBtn = document.getElementById('posClearSearch');
            if (clearBtn) clearBtn.style.display = val ? '' : 'none';
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => POS.buscar(val), 200);
        });

        document.getElementById('posClearSearch')?.addEventListener('click', () => {
            const inp = document.getElementById('posSearch');
            if (inp) inp.value = '';
            document.getElementById('posClearSearch').style.display = 'none';
            POS.buscar('');
        });

        document.getElementById('posBtnCobrar')?.addEventListener('click', () => {
            if (!POS.state.cart.length) return;
            POS_PAGO.abrirModal();
        });

        document.getElementById('posBtnAparcar')?.addEventListener('click', () => {
            if (!POS.state.cart.length) {
                Swal.fire({ icon: 'info', title: 'El carrito está vacío', timer: 1200, showConfirmButton: false });
                return;
            }
            POS.guardarOrden();
        });

        document.getElementById('posBtnLimpiar')?.addEventListener('click', () => {
            if (!POS.state.cart.length) return;
            Swal.fire({
                title: '¿Limpiar la orden?',
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Sí, limpiar',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#dc3545'
            }).then(r => { if (r.isConfirmed) POS.clearCart(); });
        });

        document.querySelectorAll('.pos-btn-borradores, #posBtnBorradores').forEach(btn => {
            btn.addEventListener('click', () => {
                POS_UI.renderBorradoresModal();
                new bootstrap.Modal(document.getElementById('posBorradoresModal')).show();
            });
        });

        document.querySelectorAll('.pos-btn-servicios, #posBtnServicios').forEach(btn => {
            btn.addEventListener('click', () => {
                POS_UI.renderServiciosModal();
                new bootstrap.Modal(document.getElementById('posServiciosModal')).show();
            });
        });

        document.getElementById('posBtnAbrirCajon')?.addEventListener('click', () => POS_QZ.abrirCajon());

        let clienteTimer;
        document.getElementById('posClienteInput')?.addEventListener('input', e => {
            const val = e.target.value.trim();
            // Limpiar ID si el usuario escribe manualmente
            const idEl = document.getElementById('posClienteId');
            if (idEl) idEl.value = '';
            clearTimeout(clienteTimer);
            if (val.length < 2) {
                const sug = document.getElementById('posClienteSugerencias');
                if (sug) sug.style.display = 'none';
                return;
            }
            clienteTimer = setTimeout(async () => {
                const lista = await POS_API.buscarCliente(val).catch(() => []);
                POS_UI.renderClienteSugerencias(lista);
            }, 300);
        });

        document.addEventListener('click', e => {
            if (!e.target.closest('.pos-customer-info')) {
                const sug = document.getElementById('posClienteSugerencias');
                if (sug) sug.style.display = 'none';
            }
        });

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

        document.getElementById('posReceiptNuevaVenta')?.addEventListener('click', () => {
            POS.clearCart();
            POS.recargarStats();
            POS._goToCatalogTab();
        });

        // Tabs móviles
        document.querySelectorAll('.pos-mobile-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.pos-mobile-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const posMain = document.querySelector('.pos-main');
                if (tab.dataset.panel === 'cart') {
                    posMain?.classList.add('pos-mobile-show-cart');
                } else {
                    posMain?.classList.remove('pos-mobile-show-cart');
                }
            });
        });
    },

    // Vuelve al tab catálogo en móvil (se llama tras cobrar o nueva venta)
    _goToCatalogTab() {
        document.querySelectorAll('.pos-mobile-tab').forEach(t => t.classList.remove('active'));
        document.querySelector('.pos-mobile-tab[data-panel="catalog"]')?.classList.add('active');
        document.querySelector('.pos-main')?.classList.remove('pos-mobile-show-cart');
    }
};

document.addEventListener('DOMContentLoaded', () => POS.init());
