// Pantalla de Fidelización: programa de sellos, QR de inscripción y tarjetas de clientes.
// Sin onclick inline (delegación de eventos), consistente con la convención CSP.

(function () {
    const app = document.getElementById('fidelizacionApp');
    if (!app) return;
    const puedeGestionar = app.dataset.puedeGestionar === '1';
    const $ = id => document.getElementById(id);

    let programa = null;
    let tarjetas = [];
    let temporizador = null;
    // Diseño elegido (se guarda junto con el programa). color=null usa el acento original del diseño.
    let diseno = 'cafe';
    let color = null;
    let logoUrl = null; // logo propio subido a R2 (null = el del negocio)
    let catalogo = { disenos: [], logoNegocio: false };
    let temporizadorPrevia = null;
    // Productos de la carta y el que está guardado en el programa (puede haberse eliminado de la carta).
    let productos = [];
    let productoGuardado = null;

    // ---------- Programa ----------

    function alternarModo() {
        const porProducto = $('pModo').value === 'producto';
        $('grupoMonto').classList.toggle('d-none', porProducto);
        $('grupoProducto').classList.toggle('d-none', !porProducto);
        $('pProducto').required = porProducto;
    }

    function pintarProductos() {
        const elegido = $('pProducto').value || productoGuardado;
        const opciones = productos.map(
            p => `<option value="${Number(p.id)}">${GF.escapeHtml(p.nombre)}</option>`
        );
        $('pProducto').innerHTML = `<option value="">Elige un producto…</option>${opciones.join('')}`;
        $('pProducto').value = elegido && productos.some(p => String(p.id) === String(elegido)) ? elegido : '';
    }

    async function cargarProductos() {
        try {
            productos = await GF.api('/api/fidelizacion/productos', {}, 'No se pudieron cargar los productos');
            pintarProductos();
        } catch (error) {
            GF.error(error.message);
        }
    }

    function pintarPrograma(p) {
        programa = p;
        diseno = p.diseno || 'cafe';
        color = p.color || null;
        logoUrl = p.logo_url || null;
        $('pLema').value = p.lema || '';
        $('pMostrarLogo').checked = Number(p.mostrar_logo ?? 1) === 1;
        $('pNombre').value = p.nombre || '';
        $('pSellos').value = p.sellos_requeridos || 8;
        $('pMonto').value = Number(p.monto_minimo || 0);
        $('pModo').value = p.modo_sello === 'producto' ? 'producto' : 'monto';
        productoGuardado = p.producto_id || null;
        pintarProductos();
        alternarModo();
        $('pPremio').value = p.premio || '';
        $('pActivo').checked = Boolean(Number(p.activo));
        if (!puedeGestionar) {
            $('formPrograma').querySelectorAll('input, button, select').forEach(el => (el.disabled = true));
            $('btnGuardarDiseno').disabled = true;
            ['pColor', 'pLema', 'pMostrarLogo', 'inputLogo', 'btnLogoNegocio', 'btnColorOriginal'].forEach(
                id => ($(id).disabled = true)
            );
        }
    }

    async function cargarPrograma() {
        pintarPrograma(await GF.api('/api/fidelizacion/programa', {}, 'No se pudo cargar el programa'));
        if (programa.configurado === false) {
            $('pPremio').value = '';
        }
        await Promise.all([cargarQr(), cargarDisenos()]);
    }

    // ---------- Diseño de la tarjeta ----------

    const svgComoImagen = svg => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

    function pintarVistaPrevia() {
        const actual = catalogo.disenos.find(d => d.id === diseno);
        const params = new URLSearchParams({
            diseno,
            sellos: 3,
            total: $('pSellos').value || 8,
            lema: $('pLema').value,
            premio: $('pPremio').value
        });
        if (color) params.set('color', color);
        if (logoUrl) params.set('logo', logoUrl);
        if (!$('pMostrarLogo').checked) params.set('sinlogo', '1');
        $('disenoPrevia').src = `/api/fidelizacion/diseno/vista-previa?${params}`;
        $('pColor').value = color || (actual && actual.acento) || '#000000';
        $('btnColorOriginal').classList.toggle('invisible', !color);
        pintarLogo();
    }

    // La vista previa viene del servidor: al escribir se espera un momento para no pedir una por tecla.
    function pintarVistaPreviaDiferida() {
        clearTimeout(temporizadorPrevia);
        temporizadorPrevia = setTimeout(pintarVistaPrevia, 350);
    }

    function pintarLogo() {
        const mostrar = $('pMostrarLogo').checked;
        $('logoMuestra').classList.toggle('d-none', !logoUrl);
        if (logoUrl) $('logoMuestra').src = logoUrl;
        $('btnLogoNegocio').classList.toggle('d-none', !logoUrl);
        $('logoAyuda').textContent = !mostrar
            ? 'La tarjeta saldrá sin logo.'
            : logoUrl
              ? 'Usando el logo que subiste para la tarjeta.'
              : catalogo.logoNegocio
                ? 'Usando el logo de tu negocio. Puedes subir otro solo para la tarjeta.'
                : 'Tu negocio no tiene logo: sube uno para mostrarlo en la tarjeta.';
    }

    async function subirLogo(e) {
        const archivo = e.target.files[0];
        e.target.value = '';
        if (!archivo) return;
        const datos = new FormData();
        datos.append('logo', archivo);
        try {
            const r = await GF.api('/api/fidelizacion/logo', { method: 'POST', body: datos }, 'No se pudo subir el logo');
            logoUrl = r.url;
            $('pMostrarLogo').checked = true;
            pintarVistaPrevia();
            GF.toast('Logo cargado: pulsa "Guardar diseño" para aplicarlo', 'success');
        } catch (error) {
            GF.error(error.message);
        }
    }

    function pintarDisenos() {
        $('disenos').innerHTML = catalogo.disenos
            .map(
                d => `<button type="button" class="fid-diseno" role="radio" aria-checked="${d.id === diseno}" data-id="${GF.escapeHtml(d.id)}" ${puedeGestionar ? '' : 'disabled'}>
                    <img alt="" src="${svgComoImagen(d.svg)}"><span>${GF.escapeHtml(d.nombre)}</span></button>`
            )
            .join('');
        pintarVistaPrevia();
    }

    async function cargarDisenos() {
        try {
            catalogo = await GF.api('/api/fidelizacion/disenos', {}, 'No se pudieron cargar los diseños');
            pintarDisenos();
        } catch (error) {
            $('disenos').innerHTML = `<div class="text-danger small">${GF.escapeHtml(error.message)}</div>`;
        }
    }

    async function guardarPrograma(e) {
        e.preventDefault();
        const btn = $('btnGuardarPrograma');
        GF.cargando(btn, true);
        try {
            const guardado = await GF.api(
                '/api/fidelizacion/programa',
                {
                    method: 'PUT',
                    body: {
                        nombre: $('pNombre').value,
                        sellos_requeridos: $('pSellos').value,
                        monto_minimo: $('pMonto').value || 0,
                        modo_sello: $('pModo').value,
                        producto_id: $('pModo').value === 'producto' ? $('pProducto').value : null,
                        premio: $('pPremio').value,
                        activo: $('pActivo').checked,
                        diseno,
                        color,
                        lema: $('pLema').value,
                        logo_url: logoUrl,
                        mostrar_logo: $('pMostrarLogo').checked
                    }
                },
                'No se pudo guardar el programa'
            );
            pintarPrograma(guardado);
            GF.toast('Programa guardado', 'success');
            await Promise.all([cargarQr(), cargarDisenos()]);
            await cargarTarjetas();
        } catch (error) {
            GF.error(error.message);
        } finally {
            GF.cargando(btn, false);
        }
    }

    // ---------- QR de inscripción ----------

    async function cargarQr(regenerar) {
        if (!puedeGestionar || !programa || programa.configurado === false) {
            $('qrVacio').classList.remove('d-none');
            $('qrContenido').classList.add('d-none');
            return;
        }
        try {
            const r = regenerar
                ? await GF.api('/api/fidelizacion/inscripcion/regenerar', { method: 'POST' }, 'No se pudo regenerar el QR')
                : await GF.api('/api/fidelizacion/inscripcion', {}, 'No se pudo cargar el QR');
            $('qrImagen').src = r.qr;
            $('qrUrl').value = r.url;
            $('btnDescargarQr').href = r.qr;
            $('qrVacio').classList.add('d-none');
            $('qrContenido').classList.remove('d-none');
        } catch {
            $('qrVacio').classList.remove('d-none');
            $('qrContenido').classList.add('d-none');
        }
    }

    async function regenerarQr() {
        const ok = await GF.confirmar('El QR anterior dejará de funcionar. ¿Generar uno nuevo?', {
            confirmar: 'Sí, generar',
            peligro: true
        });
        if (!ok) return;
        await cargarQr(true);
        GF.toast('QR nuevo generado', 'success');
    }

    async function copiar(texto) {
        try {
            await navigator.clipboard.writeText(texto);
            GF.toast('Enlace copiado', 'success');
        } catch {
            GF.error('No se pudo copiar. Selecciona el texto y cópialo a mano.');
        }
    }

    // ---------- Tarjetas ----------

    function filaTarjeta(t) {
        const total = programa ? programa.sellos_requeridos : '';
        const premios = t.premios_disponibles
            ? `<span class="badge bg-success">${t.premios_disponibles} por canjear</span>`
            : '<span class="text-muted">—</span>';
        const canjear =
            puedeGestionar && t.premios_disponibles
                ? `<button class="btn btn-sm btn-success btn-canjear" data-id="${t.id}"><i class="bi bi-gift me-1"></i>Canjear</button>`
                : '';
        return `<tr>
            <td><div class="fw-semibold">${GF.escapeHtml(t.cliente_nombre)}</div>
                <div class="small text-muted">${GF.escapeHtml(t.cliente_telefono || '')}</div></td>
            <td><code>${GF.escapeHtml(t.numero)}</code></td>
            <td>${t.sellos} / ${total}<div class="small text-muted">${t.sellos_historicos} en total</div></td>
            <td>${premios}<div class="small text-muted">${t.premios_canjeados} canjeados</div></td>
            <td class="text-end">${canjear}
                <button class="btn btn-sm btn-outline-secondary btn-enlace" data-token="${GF.escapeHtml(t.token_publico)}" title="Copiar enlace de la tarjeta"><i class="bi bi-link-45deg"></i></button>
                <button class="btn btn-sm btn-outline-primary btn-historial" data-id="${t.id}" title="Historial"><i class="bi bi-clock-history"></i></button></td>
        </tr>`;
    }

    async function cargarTarjetas() {
        const q = $('filtroTarjetas').value.trim();
        const tbody = $('tbodyTarjetas');
        try {
            tarjetas = await GF.api(
                '/api/fidelizacion/tarjetas' + (q ? `?q=${encodeURIComponent(q)}` : ''),
                {},
                'No se pudieron cargar las tarjetas'
            );
            tbody.innerHTML = tarjetas.length
                ? tarjetas.map(filaTarjeta).join('')
                : '<tr><td colspan="5" class="text-muted text-center py-4">Aún no hay tarjetas. Comparte el QR con tus clientes.</td></tr>';
        } catch (error) {
            GF.tableError(tbody, 5, 'No se pudieron cargar las tarjetas', error);
        }
    }

    async function canjear(id) {
        const ok = await GF.confirmar('Se descontará un premio de esta tarjeta.', { confirmar: 'Canjear premio' });
        if (!ok) return;
        try {
            await GF.api(`/api/fidelizacion/tarjetas/${id}/canjear`, { method: 'POST' }, 'No se pudo canjear el premio');
            GF.toast('Premio canjeado', 'success');
            await cargarTarjetas();
        } catch (error) {
            GF.error(error.message);
        }
    }

    const ETIQUETA = { sello: 'Sello', premio_ganado: 'Premio ganado', canje: 'Premio canjeado' };

    async function verHistorial(id) {
        try {
            const { tarjeta, movimientos } = await GF.api(`/api/fidelizacion/tarjetas/${id}`, {}, 'No se pudo cargar el historial');
            const filas = movimientos.length
                ? movimientos
                      .map(
                          m =>
                              `<tr><td>${new Date(m.created_at).toLocaleString('es-CO')}</td><td>${ETIQUETA[m.tipo] || GF.escapeHtml(m.tipo)}</td><td>${m.factura_id ? '#' + m.factura_id : ''}</td></tr>`
                      )
                      .join('')
                : '<tr><td colspan="3" class="text-muted">Sin movimientos</td></tr>';
            Swal.fire({
                title: GF.escapeHtml(tarjeta.cliente_nombre),
                html: `<div class="text-start small"><table class="table table-sm"><thead><tr><th>Fecha</th><th>Movimiento</th><th>Factura</th></tr></thead><tbody>${filas}</tbody></table></div>`,
                width: 560,
                confirmButtonText: 'Cerrar'
            });
        } catch (error) {
            GF.error(error.message);
        }
    }

    // ---------- Eventos ----------

    $('formPrograma').addEventListener('submit', guardarPrograma);
    $('btnCopiarQr').addEventListener('click', () => copiar($('qrUrl').value));
    $('btnRegenerarQr').addEventListener('click', regenerarQr);
    $('disenos').addEventListener('click', e => {
        const btn = e.target.closest('.fid-diseno');
        if (!btn) return;
        diseno = btn.dataset.id;
        $('disenos')
            .querySelectorAll('.fid-diseno')
            .forEach(b => b.setAttribute('aria-checked', String(b === btn)));
        pintarVistaPrevia();
    });
    $('pColor').addEventListener('input', e => {
        color = e.target.value;
        pintarVistaPreviaDiferida();
    });
    $('btnColorOriginal').addEventListener('click', () => {
        color = null;
        pintarVistaPrevia();
    });
    $('pLema').addEventListener('input', pintarVistaPreviaDiferida);
    $('pPremio').addEventListener('input', pintarVistaPreviaDiferida);
    $('pModo').addEventListener('change', alternarModo);
    $('pSellos').addEventListener('change', pintarVistaPrevia);
    $('pMostrarLogo').addEventListener('change', pintarVistaPrevia);
    $('inputLogo').addEventListener('change', subirLogo);
    $('btnLogoNegocio').addEventListener('click', () => {
        logoUrl = null;
        pintarVistaPrevia();
    });

    $('filtroTarjetas').addEventListener('input', () => {
        clearTimeout(temporizador);
        temporizador = setTimeout(cargarTarjetas, 300);
    });
    $('tbodyTarjetas').addEventListener('click', e => {
        const btn = e.target.closest('button');
        if (!btn) return;
        if (btn.classList.contains('btn-canjear')) canjear(btn.dataset.id);
        else if (btn.classList.contains('btn-historial')) verHistorial(btn.dataset.id);
        else if (btn.classList.contains('btn-enlace')) copiar(`${location.origin}/tarjeta/${btn.dataset.token}`);
    });

    cargarProductos();
    cargarPrograma().then(cargarTarjetas);
})();
