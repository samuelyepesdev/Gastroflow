/**
 * Kitchen JavaScript - Groups items by table with nested cards, or by
 * estación (KDS) según el toggle "Por mesa / Por estación".
 * Related to: views/cocina/index.ejs, routes/tenant/cocina.js
 */

const UMBRAL_MEDIO_MIN = 10;
const UMBRAL_ALTO_MIN = 20;
const MODO_VISTA_KEY = 'gastroflow.cocina.modoVista';

function escapeHtml(str) {
    return String(str)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

// Agrupa los modificadores/toppings de un ítem por su grupo (ej. "Elige tu salsa",
// "Toppings") para que en la comanda se lea a qué corresponde cada selección, en vez
// de una lista plana de nombres sin contexto (ej. "chocolate, chocolate").
function formatModificadores(mods) {
    if (!mods?.length) return '';
    const porGrupo = new Map();
    mods.forEach(m => {
        const grupo = m.grupo_nombre || 'Opciones';
        if (!porGrupo.has(grupo)) porGrupo.set(grupo, []);
        porGrupo.get(grupo).push(m.opcion_nombre);
    });
    return [...porGrupo.entries()]
        .map(([grupo, opciones]) => `${grupo}: ${opciones.join(', ')}`)
        .join(' · ');
}

/**
 * Create card for individual item (sub-card inside mesa card)
 */
function cardItem(it) {
    let estadoBadge;
    if (it.estado === 'preparando') {
        estadoBadge = '<span class="badge bg-warning">Preparando</span>';
    } else if (it.estado === 'listo') {
        estadoBadge = '<span class="badge bg-success">Listo</span>';
    } else {
        estadoBadge = '<span class="badge bg-secondary">Enviado</span>';
    }

    const actions = `
        <div class="mt-2 d-flex gap-2 flex-wrap">
            ${it.estado === 'enviado'
            ? `<button class="btn btn-sm btn-primary" data-action="prep" data-id="${it.id}">
                    <i class="bi bi-play"></i> Preparar
                   </button>`
            : ''}
            ${it.estado === 'preparando'
            ? `<button class="btn btn-sm btn-success" data-action="listo" data-id="${it.id}">
                    <i class="bi bi-check2"></i> Listo
                   </button>`
            : ''}
            ${it.estado === 'listo'
            ? `<button class="btn btn-sm btn-outline-dark" data-action="servido" data-id="${it.id}">
                    <i class="bi bi-box-seam"></i> Recogido
                   </button>`
            : ''}
        </div>`;

    return `
        <div class="card mb-2 item-card">
            <div class="card-body">
                <div class="d-flex justify-content-between align-items-start">
                    <div class="flex-grow-1">
                        <div class="d-flex align-items-center gap-2 mb-2">
                            <span class="producto">${it.producto_nombre}</span>
                            ${estadoBadge}
                            <span class="badge bg-dark cantidad-badge">${it.cantidad} ${it.unidad_medida || 'UND'}</span>
                        </div>
                        ${it.nota ? `
                        <div class="nota-especial">
                            <strong>Instrucciones Especiales:</strong>
                            <span>${it.nota}</span>
                        </div>` : ''}
                        ${it.modificadores?.length ? `
                        <div class="nota-especial">
                            <strong>Detalle:</strong>
                            <span>${escapeHtml(formatModificadores(it.modificadores))}</span>
                        </div>` : ''}
                        <div class="small text-muted">
                            <i class="bi bi-clock"></i> ${new Date(it.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                            ${it.enviado_at ? ` • Enviado: ${new Date(it.enviado_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : ''}
                        </div>
                    </div>
                </div>
                ${actions}
            </div>
        </div>`;
}

// --- Modo "Por estación" (KDS) ---------------------------------------------

function minutosEsperando(item) {
    const desde = item.enviado_at || item.created_at;
    if (!desde) return 0;
    return Math.max(0, Math.round((Date.now() - new Date(desde).getTime()) / 60000));
}

function claseEspera(minutos) {
    if (minutos >= UMBRAL_ALTO_MIN) return 'espera-alta';
    if (minutos >= UMBRAL_MEDIO_MIN) return 'espera-media';
    return 'espera-normal';
}

function cardItemEstacion(item) {
    const minutos = minutosEsperando(item);
    const mesaLabel = item.pedido_origen === 'caja' ? item.mesa_descripcion || 'Mostrador' : `Mesa ${item.mesa_numero}`;
    const accion =
        item.estado === 'enviado'
            ? `<button class="btn btn-sm btn-primary w-100 mt-1" data-action="prep" data-id="${item.id}"><i class="bi bi-play"></i> Preparar</button>`
            : item.estado === 'preparando'
              ? `<button class="btn btn-sm btn-success w-100 mt-1" data-action="listo" data-id="${item.id}"><i class="bi bi-check2"></i> Listo</button>`
              : '';

    return `
        <div class="kds-item ${claseEspera(minutos)}">
            <div class="d-flex justify-content-between">
                <span class="kds-item-producto">${escapeHtml(item.producto_nombre)}</span>
                <span class="badge bg-dark">${item.cantidad}</span>
            </div>
            <div class="kds-item-meta">${escapeHtml(mesaLabel)} · Pedido #${item.pedido_numero} · esperando ${minutos} min</div>
            ${item.nota ? `<div class="kds-item-nota"><i class="bi bi-chat-left-text"></i> ${escapeHtml(item.nota)}</div>` : ''}
            ${accion}
        </div>
    `;
}

function agruparPorEstacion(items, estaciones) {
    const grupos = new Map(estaciones.map(e => [e.id, []]));
    const sinEstacion = [];

    for (const item of items) {
        if (item.estacion_id && grupos.has(item.estacion_id)) {
            grupos.get(item.estacion_id).push(item);
        } else {
            sinEstacion.push(item);
        }
    }

    return { grupos, sinEstacion };
}

function renderPorEstacion(itemsEnCocina, estaciones) {
    const contenedor = document.getElementById('listaColaEstacion');
    if (!contenedor) return;

    const { grupos, sinEstacion } = agruparPorEstacion(itemsEnCocina, estaciones);

    const columnasHtml = estaciones
        .map(estacion => {
            const itemsEstacion = grupos.get(estacion.id) || [];
            return `
                <div class="kds-columna">
                    <div class="kds-columna-header">
                        <span>${escapeHtml(estacion.nombre)}</span>
                        <span class="badge bg-secondary">${itemsEstacion.length}</span>
                    </div>
                    <div class="kds-columna-body">
                        ${itemsEstacion.length ? itemsEstacion.map(cardItemEstacion).join('') : '<div class="kds-empty">Sin pendientes</div>'}
                    </div>
                </div>
            `;
        })
        .join('');

    const columnaSinEstacion = `
        <div class="kds-columna">
            <div class="kds-columna-header">
                <span>Sin estación</span>
                <span class="badge bg-secondary">${sinEstacion.length}</span>
            </div>
            <div class="kds-columna-body">
                ${sinEstacion.length ? sinEstacion.map(cardItemEstacion).join('') : '<div class="kds-empty">Sin pendientes</div>'}
            </div>
        </div>
    `;

    contenedor.innerHTML = columnasHtml + columnaSinEstacion;
}

/**
 * Create card for mesa (parent card containing items)
 */
function cardMesa(mesaNumero, items) {
    const itemsHtml = items.map(it => cardItem(it)).join('');
    const esPOS = items[0]?.pedido_origen === 'caja';
    const nombrePedido = (items[0]?.mesa_descripcion || '').trim();
    const titulo = escapeHtml(esPOS ? (nombrePedido || 'Venta mostrador') : `Mesa ${mesaNumero}`);
    const icono = esPOS ? 'bi-shop' : 'bi-table';
    const headerClass = esPOS ? 'bg-info text-dark' : 'bg-primary text-white';
    const btnCompletar = esPOS
        ? `<button class="btn btn-sm btn-dark ms-2" data-action="completar-pos" data-pedido-id="${items[0].pedido_id}">
                <i class="bi bi-check2-all"></i> Completar pedido
            </button>
           <button class="btn btn-sm btn-outline-danger ms-2" data-action="cancelar-pos" data-pedido-id="${items[0].pedido_id}">
                <i class="bi bi-x-circle"></i> Cancelar pedido
            </button>`
        : '';

    return `
        <div class="card mb-3 mesa-card">
            <div class="card-header ${headerClass} d-flex justify-content-between align-items-center flex-wrap gap-2">
                <div>
                    <i class="bi ${icono} me-2"></i>
                    <strong>${titulo}</strong>
                    <span class="badge bg-light text-dark ms-2">${items.length} ${items.length === 1 ? 'ítem' : 'ítems'}</span>
                </div>
                <div class="d-flex align-items-center">
                    <div class="badge bg-light text-dark">
                        Pedido #${items[0]?.pedido_numero || ''}
                    </div>
                    ${btnCompletar}
                </div>
            </div>
            <div class="card-body">
                ${itemsHtml}
            </div>
        </div>`;
}

$(function () {
    const estaciones = JSON.parse(document.getElementById('kds-estaciones-data')?.textContent || '[]');
    let itemsEnCocinaCache = [];
    let modoVista = localStorage.getItem(MODO_VISTA_KEY) === 'estacion' ? 'estacion' : 'mesa';

    // Allow opening tab directly with ?tab=listos
    function activarTabDesdeQuery() {
        // For mesero role, always show "Listos" tab
        const userRole = document.body.dataset.userRole || '';
        if (userRole === 'mesero') {
            const triggerEl = document.querySelector('#tabListos-tab');
            if (triggerEl) {
                const tabObj = new bootstrap.Tab(triggerEl);
                tabObj.show();
            }
            return;
        }

        // For other roles, allow query parameter
        const params = new URLSearchParams(window.location.search);
        const tab = params.get('tab');
        if (tab === 'listos') {
            const triggerEl = document.querySelector('#tabListos-tab');
            if (triggerEl) {
                const tabObj = new bootstrap.Tab(triggerEl);
                tabObj.show();
            }
        }
    }

    /**
     * Load kitchen queue
     */
    async function cargarCola() {
        try {
            const resp = await fetch('/api/cocina/cola');
            if (!resp.ok) throw new Error('Error al cargar cola');
            const items = await resp.json();
            render(items);
        } catch (error) {
            console.error('Error al cargar cola:', error);
        }
    }

    /**
     * Render "En cocina" agrupado por mesa (modo clásico)
     */
    function renderPorMesaEnCocina(itemsEnCocina) {
        const cola = $('#listaCola').empty();

        if (itemsEnCocina.length > 0) {
            const porMesaEnCocina = new Map();
            itemsEnCocina.forEach(it => {
                const key = it.mesa_numero;
                if (!porMesaEnCocina.has(key)) {
                    porMesaEnCocina.set(key, []);
                }
                porMesaEnCocina.get(key).push(it);
            });

            // Sort by mesa number (numeric)
            [...porMesaEnCocina.entries()]
                .sort((a, b) => {
                    const numA = Number.parseInt(a[0]) || 0;
                    const numB = Number.parseInt(b[0]) || 0;
                    return numA - numB;
                })
                .forEach(([mesa, arr]) => {
                    cola.append(cardMesa(mesa, arr));
                });
        } else {
            cola.append('<div class="text-center text-muted py-4">No hay items en cocina</div>');
        }
    }

    /**
     * Muestra el contenedor del modo activo (mesa/estación) y lo renderiza
     * con los últimos items recibidos, sin necesidad de volver a pedir la cola.
     */
    function aplicarModoVista() {
        $('#vistaCocinaToggle button[data-modo]')
            .removeClass('active')
            .filter(`[data-modo="${modoVista}"]`)
            .addClass('active');

        if (modoVista === 'estacion') {
            $('#listaCola').attr('hidden', true);
            $('#listaColaEstacion').removeAttr('hidden');
            renderPorEstacion(itemsEnCocinaCache, estaciones);
        } else {
            $('#listaColaEstacion').attr('hidden', true);
            $('#listaCola').removeAttr('hidden');
            renderPorMesaEnCocina(itemsEnCocinaCache);
        }
    }

    $('#vistaCocinaToggle').on('click', 'button[data-modo]', function () {
        if (this.dataset.modo === modoVista) return;
        modoVista = this.dataset.modo;
        try {
            localStorage.setItem(MODO_VISTA_KEY, modoVista);
        } catch (error) {
            // Storage puede fallar en modo privado; no es crítico para el toggle.
        }
        aplicarModoVista();
    });

    /**
     * Group items by mesa and render
     */
    function render(items) {
        const listos = $('#listaListos').empty();

        // Filter items by state
        const itemsEnCocina = items.filter(it => it.estado !== 'listo');
        const itemsListos = items.filter(it => it.estado === 'listo');

        itemsEnCocinaCache = itemsEnCocina;

        // Render summary of totals (only for "En cocina" items)
        renderResumen(itemsEnCocina);

        // "En cocina" tab: agrupado por mesa o por estación, según el toggle activo
        aplicarModoVista();

        // Group by mesa for "Listos" tab
        if (itemsListos.length > 0) {
            const porMesaListos = new Map();
            itemsListos.forEach(it => {
                const key = it.mesa_numero;
                if (!porMesaListos.has(key)) {
                    porMesaListos.set(key, []);
                }
                porMesaListos.get(key).push(it);
            });

            // Sort by mesa number (numeric)
            [...porMesaListos.entries()]
                .sort((a, b) => {
                    const numA = Number.parseInt(a[0]) || 0;
                    const numB = Number.parseInt(b[0]) || 0;
                    return numA - numB;
                })
                .forEach(([mesa, arr]) => {
                    listos.append(cardMesa(mesa, arr));
                });
        } else {
            listos.append('<div class="text-center text-muted py-4">No hay items listos</div>');
        }
    }

    function renderResumen(items) {
        const container = $('#resumenCocina');
        if (container.length === 0) return;
        container.empty();

        if (items.length === 0) {
            return;
        }

        // Agrupación de primer nivel por Nombre de Producto
        const resumenProductos = new Map(); // producto_nombre -> { total, pendientesTotal, unidades, variaciones: Map(nota -> {total, enviado, preparando}) }

        items.forEach(it => {
            const nombre = it.producto_nombre;
            if (!resumenProductos.has(nombre)) {
                resumenProductos.set(nombre, {
                    total: 0,
                    unidades: new Set(),
                    variaciones: new Map()
                });
            }

            const pData = resumenProductos.get(nombre);
            pData.total += Number(it.cantidad);
            pData.unidades.add(it.unidad_medida || 'UND');

            // La clave de variación combina nota + toppings elegidos: dos líneas del mismo
            // producto con distinta nota o distintos toppings no deben agruparse/marcarse juntas.
            const modsTexto = formatModificadores(it.modificadores);
            const varKey = (it.nota || '') + '||' + (it.modificadores_hash || '');
            if (!pData.variaciones.has(varKey)) {
                pData.variaciones.set(varKey, {
                    total: 0, enviado: 0, preparando: 0,
                    nota: it.nota || '', modificadoresHash: it.modificadores_hash || '', modsTexto
                });
            }
            const vData = pData.variaciones.get(varKey);
            vData.total += Number(it.cantidad);
            if (it.estado === 'enviado') vData.enviado += Number(it.cantidad);
            if (it.estado === 'preparando') vData.preparando += Number(it.cantidad);
        });

        let html = `
            <div class="card shadow-sm border-0 border-start border-4 border-primary">
                <div class="card-header bg-white py-2">
                    <h5 class="card-title mb-0 fw-bold text-primary">
                        <i class="bi bi-list-check me-2"></i>Totales Consolidados
                    </h5>
                </div>
                <div class="card-body bg-light px-2 py-2">
                    <div class="row row-cols-2 row-cols-md-3 row-cols-lg-4 g-2">
        `;

        resumenProductos.forEach((pData, pNombre) => {
            const unidadStr = Array.from(pData.unidades).join('/');

            html += `
                <div class="col">
                    <div class="card h-100 resumen-item shadow-none">
                        <div class="card-body p-3">
                            <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
                                <span class="producto-nombre">${pNombre}</span>
                                <span class="total-badge">${pData.total} <small>${unidadStr}</small></span>
                            </div>
                            <div class="variaciones-list border-top pt-2">
            `;

            pData.variaciones.forEach((vData) => {
                const label = escapeHtml([vData.nota, vData.modsTexto].filter(Boolean).join(' · ') || 'Estándar');
                const isNota = !!(vData.nota || vData.modsTexto);

                html += `
                    <div class="mb-3 p-2 rounded ${isNota ? 'nota-resumen border border-warning' : 'bg-white border text-muted md-light'} shadow-none">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <span class="${isNota ? 'text-dark fw-bold' : 'text-muted'}" style="font-size: 0.85rem; line-height: 1.2;">
                                ${isNota ? '<i class="bi bi-sticky-fill me-1"></i>' : ''}${label}
                            </span>
                            <span class="badge ${isNota ? 'bg-warning text-dark' : 'bg-secondary'} rounded-pill">${vData.total}</span>
                        </div>

                        <div class="d-flex flex-column flex-sm-row gap-1">
                        ${vData.enviado > 0 ? `
                            <button class="btn btn-xs btn-primary flex-fill px-1 py-1 btn-preparar-lote"
                                data-nombre="${pNombre}"
                                data-nota="${vData.nota}"
                                data-mods-hash="${vData.modificadoresHash}"
                                data-estado="preparando"
                                title="Iniciar preparación">
                                <i class="bi bi-play-fill"></i> Iniciar (${vData.enviado})
                            </button>
                        ` : ''}

                        ${vData.preparando > 0 ? `
                            <button class="btn btn-xs btn-success flex-fill px-1 py-1 btn-preparar-lote"
                                data-nombre="${pNombre}"
                                data-nota="${vData.nota}"
                                data-mods-hash="${vData.modificadoresHash}"
                                data-estado="listo"
                                title="Marcar todos como listos">
                                <i class="bi bi-check-all"></i> Listo (${vData.preparando})
                            </button>
                        ` : ''}
                        </div>

                        ${vData.enviado === 0 && vData.preparando === 0 ? `
                            <div class="text-success x-small text-center pt-1" style="font-size: 0.65rem;"><i class="bi bi-check2-all"></i> Todo listo</div>
                        ` : ''}
                    </div>
                `;
            });

            html += `
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });

        html += `
                    </div>
                </div>
            </div>
        `;

        container.append(html);
    }


    // Evento para preparar lote
    $(document).on('click', '.btn-preparar-lote', async function () {
        const btn = $(this);
        const productoNombre = btn.data('nombre');
        const nota = btn.data('nota');
        const modificadoresHash = btn.data('mods-hash') || null;
        const estado = btn.data('estado'); // nuevo: tomamos el estado del botón (preparando o listo)

        const oldHtml = btn.html();
        btn.prop('disabled', true).html('<span class="spinner-border spinner-border-sm"></span>');

        try {
            const resp = await fetch('/api/cocina/preparar-lote', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    productoNombre,
                    nota,
                    estado,
                    modificadoresHash
                })
            });

            if (!resp.ok) throw new Error('Error al procesar lote');
            await cargarCola();
        } catch (error) {
            console.error('Error batch:', error);
            alert('Error al actualizar el lote');
            btn.prop('disabled', false).html(oldHtml);
        }
    });

    // Action handlers
    $(document).on('click', '[data-action="prep"]', async function () {
        const id = this.dataset.id;
        try {
            await fetch(`/api/cocina/item/${id}/estado`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ estado: 'preparando' })
            });
            await cargarCola();
        } catch (error) {
            console.error('Error:', error);
            alert('Error al actualizar estado');
        }
    });

    $(document).on('click', '[data-action="listo"]', async function () {
        const id = this.dataset.id;
        try {
            await fetch(`/api/cocina/item/${id}/estado`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ estado: 'listo' })
            });
            await cargarCola();
        } catch (error) {
            console.error('Error:', error);
            alert('Error al actualizar estado');
        }
    });

    $(document).on('click', '[data-action="completar-pos"]', async function () {
        const pedidoId = this.dataset.pedidoId;
        const confirm = await Swal.fire({
            icon: 'question',
            title: '¿Completar pedido?',
            text: 'Se marcará como listo y saldrá de la cola de cocina.',
            showCancelButton: true,
            confirmButtonText: 'Sí, completar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#198754'
        });
        if (!confirm.isConfirmed) return;

        try {
            const resp = await fetch(`/api/cocina/pedidos/${pedidoId}/completar`, { method: 'PUT' });
            if (!resp.ok) throw new Error('Error al completar pedido');
            await cargarCola();
        } catch (error) {
            console.error('Error:', error);
            Swal.fire({ icon: 'error', title: 'No se pudo completar el pedido' });
        }
    });

    $(document).on('click', '[data-action="cancelar-pos"]', async function () {
        const pedidoId = this.dataset.pedidoId;
        const confirm = await Swal.fire({
            icon: 'warning',
            title: '¿Cancelar pedido?',
            text: 'Se cancelará el pedido completo y saldrá de la cola de cocina. Esta acción no se puede deshacer.',
            showCancelButton: true,
            confirmButtonText: 'Sí, cancelar',
            cancelButtonText: 'No',
            confirmButtonColor: '#dc3545'
        });
        if (!confirm.isConfirmed) return;

        try {
            const resp = await fetch(`/api/cocina/pedidos/${pedidoId}/cancelar`, { method: 'PUT' });
            if (!resp.ok) throw new Error('Error al cancelar pedido');
            await cargarCola();
        } catch (error) {
            console.error('Error:', error);
            Swal.fire({ icon: 'error', title: 'No se pudo cancelar el pedido' });
        }
    });

    $(document).on('click', '[data-action="servido"]', async function () {
        const id = this.dataset.id;
        try {
            await fetch(`/api/mesas/items/${id}/estado`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ estado: 'servido' })
            });
            await cargarCola();
        } catch (error) {
            console.error('Error:', error);
            alert('Error al actualizar estado');
        }
    });

    // Real-time notifications (SSE)
    (function () {
        if (window.EventSource) {
            const source = new EventSource('/api/notifications/subscribe');

            source.addEventListener('message', function (e) {
                try {
                    const data = JSON.parse(e.data);
                    if (data.event === 'orderCreated') {
                        console.log('Evento de cocina detectado:', data);

                        // Si es una cancelación, mostrar alerta específica
                        if (data.action === 'cancelled') {
                            const Toast = Swal.mixin({
                                toast: true, position: 'top-end', showConfirmButton: false, timer: 4000
                            });
                            Toast.fire({
                                icon: 'warning',
                                title: 'Pedido Cancelado',
                                text: `El pedido #${data.pedidoId} ha sido cancelado.`
                            });
                        }

                        // En cualquier caso (nuevo o cancelado), refrescar la cola inmediatamente
                        cargarCola();
                    }
                } catch (err) {
                    console.error('Error SSE Cocina:', err);
                }
            }, false);

            window.addEventListener('beforeunload', () => source.close());
        }
    })();

    // Auto-refresh every 5 seconds (fallback)
    cargarCola();
    // Respaldo del SSE: sin consultar con la pestaña oculta, y al volver a ella
    // refresca de inmediato por si se perdió algún pedido mientras tanto.
    setInterval(() => {
        if (document.visibilityState === 'visible') cargarCola();
    }, 30000);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') cargarCola();
    });
    activarTabDesdeQuery();
});
