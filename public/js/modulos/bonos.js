// Emisión, anulación y consulta de movimientos de bonos redimibles.
// Sin onclick inline (delegación de eventos), consistente con la convención CSP.

(function () {
    function fmt(n) {
        return '$' + (Number(n) || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    // ---------- Editor de diseño (emitir bono / cambiar diseño) ----------

    let plantillasCache = null;

    async function cargarPlantillas() {
        if (plantillasCache) return plantillasCache;
        const r = await fetch('/bonos/plantillas');
        if (!r.ok) throw new Error('No se pudieron cargar las plantillas');
        plantillasCache = await r.json();
        return plantillasCache;
    }

    function svgComoFondo(svg) {
        return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
    }

    function escapar(texto) {
        const div = document.createElement('div');
        div.textContent = texto == null ? '' : String(texto);
        return div.innerHTML;
    }

    function formatoVigencia(fecha) {
        if (!fecha) return 'Sin fecha de vencimiento';
        const d = new Date(`${fecha}T12:00:00Z`);
        if (Number.isNaN(d.getTime())) return 'Sin fecha de vencimiento';
        return 'Válido hasta el ' + d.toLocaleDateString('es-CO', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
    }

    function htmlEditor(plantillas, opciones) {
        const { modo, bono } = opciones;
        const galeria = plantillas
            .map(
                p => `
                <button type="button" class="bono-plantilla" data-plantilla="${p.id}" aria-pressed="false" title="${escapar(p.nombre)}">
                    <span class="bono-plantilla__img" style='background-image: ${svgComoFondo(p.svg)}'>
                        <span class="bono-plantilla__titulo" style="color:${p.colores.titulo}">${escapar(p.titulo)}</span>
                    </span>
                    <span class="bono-plantilla__nombre">${escapar(p.nombre)}</span>
                </button>`
            )
            .join('');

        const seccionValor =
            modo === 'emitir'
                ? `
                <div>
                    <div class="bono-seccion__titulo">1. Valor y tipo</div>
                    <div class="input-group">
                        <span class="input-group-text">$</span>
                        <input id="bonoValorInput" type="text" inputmode="decimal" class="form-control bono-valor money-input" placeholder="50.000" aria-label="Valor del bono">
                    </div>
                    <div class="bono-origen" role="radiogroup" aria-label="Tipo de bono">
                        <input type="radio" name="bonoOrigen" id="bonoOrigenRegalo" value="regalo" checked>
                        <label for="bonoOrigenRegalo"><i class="bi bi-gift"></i><span><strong>Regalo</strong>Cortesía del negocio, sin cobro</span></label>
                        <input type="radio" name="bonoOrigen" id="bonoOrigenComprado" value="comprado">
                        <label for="bonoOrigenComprado"><i class="bi bi-cash-coin"></i><span><strong>Comprado</strong>El cliente lo paga ahora (entra a caja)</span></label>
                    </div>
                </div>`
                : '';

        const n = modo === 'emitir' ? { diseno: 2, dedicatoria: 3, mas: 4 } : { diseno: 1, dedicatoria: 2 };
        const seccionMas =
            modo === 'emitir'
                ? `
                <div>
                    <div class="bono-seccion__titulo">${n.mas}. Más opciones</div>
                    <div class="bono-campos">
                        <div>
                            <label class="form-label small text-muted mb-1" for="bonoVenceInput">Vence (opcional)</label>
                            <input id="bonoVenceInput" type="date" class="form-control">
                        </div>
                        <div>
                            <label class="form-label small text-muted mb-1" for="bonoNotaInput">Nota interna</label>
                            <input id="bonoNotaInput" type="text" class="form-control" maxlength="255" placeholder="No sale en el bono">
                        </div>
                    </div>
                </div>`
                : '';

        return `
            <div class="bono-editor">
                <div class="bono-editor__form">
                    ${seccionValor}
                    <div>
                        <div class="bono-seccion__titulo">${n.diseno}. Diseño</div>
                        <div class="bono-galeria">${galeria}</div>
                    </div>
                    <div>
                        <div class="bono-seccion__titulo">${n.dedicatoria}. Dedicatoria (opcional)</div>
                        <div class="bono-campos mb-2">
                            <input id="bonoParaInput" type="text" class="form-control" maxlength="60" placeholder="Para: Ej. Papá" aria-label="Para">
                            <input id="bonoDeInput" type="text" class="form-control" maxlength="60" placeholder="De: Ej. Tus hijos" aria-label="De">
                        </div>
                        <textarea id="bonoMensajeInput" class="form-control" rows="2" maxlength="160" aria-label="Mensaje"></textarea>
                        <div class="d-flex justify-content-between mt-1">
                            <span class="small text-muted">Si lo dejas vacío, usamos el mensaje sugerido.</span>
                            <span class="bono-contador" id="bonoMensajeContador">0/160</span>
                        </div>
                    </div>
                    ${seccionMas}
                </div>
                <div class="bono-editor__preview">
                    <div class="bono-seccion__titulo">Vista previa</div>
                    <div class="bono-preview" id="bonoPreview">
                        <div class="bono-preview__logo" id="bpLogo" hidden><img alt=""></div>
                        <div class="bono-preview__negocio" id="bpNegocio"><span id="bpNegocioNombre"></span><span class="bono-preview__etiqueta" id="bpEtiqueta"></span></div>
                        <div class="bono-preview__titulo" id="bpTitulo"></div>
                        <div class="bono-preview__dedicatoria" id="bpDedicatoria"></div>
                        <div class="bono-preview__mensaje" id="bpMensaje"></div>
                        <div class="bono-preview__vigencia" id="bpVigencia"></div>
                        <div class="bono-preview__pie" id="bpPie"></div>
                        <div class="bono-preview__panel">
                            <span class="bono-preview__rotulo">VALOR</span>
                            <span class="bono-preview__valor" id="bpValor"></span>
                            <i class="bi bi-qr-code bono-preview__qr" aria-hidden="true"></i>
                            <span class="bono-preview__rotulo">CÓDIGO</span>
                            <span class="bono-preview__codigo">${escapar(bono?.codigo || 'BONO-XXXXXX')}</span>
                        </div>
                    </div>
                    <div class="bono-preview-acciones">
                        <span>El código y el QR reales se generan al emitir.</span>
                        <button type="button" class="btn btn-link btn-sm p-0" id="bonoVerPdf"><i class="bi bi-file-earmark-pdf me-1"></i>Ver PDF</button>
                    </div>
                </div>
            </div>`;
    }

    /**
     * Abre el editor. modo 'emitir' (valor, tipo, diseño, dedicatoria, vencimiento)
     * o 'disenar' (solo diseño y dedicatoria de un bono ya emitido).
     * Devuelve los datos del formulario o null si se canceló.
     */
    async function abrirEditor(modo, bono) {
        let plantillas;
        try {
            plantillas = await cargarPlantillas();
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
            return null;
        }

        const btn = document.getElementById('btnNuevoBono');
        const negocio = btn?.dataset.negocio || '';
        const logo = btn?.dataset.logo || '';
        const estado = { plantilla: bono?.plantilla || 'clasico' };

        const { value } = await Swal.fire({
            title: `<h4 class="mb-0 fw-bold"><i class="bi bi-gift me-2 text-primary"></i>${modo === 'emitir' ? 'Emitir bono' : 'Cambiar diseño del bono'}</h4>`,
            html: htmlEditor(plantillas, { modo, bono }),
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: modo === 'emitir' ? '<i class="bi bi-gift me-1"></i>Emitir bono' : '<i class="bi bi-arrow-repeat me-1"></i>Regenerar comprobante',
            cancelButtonText: 'Cancelar',
            customClass: { popup: 'bono-swal rounded-4 shadow' },
            didOpen: popup => {
                const $ = sel => popup.querySelector(sel);
                const valorInput = $('#bonoValorInput');
                if (valorInput && window.MoneyInput) window.MoneyInput.attach(valorInput);

                if (bono) {
                    $('#bonoParaInput').value = bono.destinatario || '';
                    $('#bonoDeInput').value = bono.remitente || '';
                    $('#bonoMensajeInput').value = bono.mensaje || '';
                }

                const leerValor = () => {
                    if (!valorInput) return Number(bono?.valor_inicial) || 0;
                    return window.MoneyInput ? window.MoneyInput.parse(valorInput.value) : Number(valorInput.value);
                };
                const leerOrigen = () => popup.querySelector('input[name="bonoOrigen"]:checked')?.value || bono?.origen || 'regalo';

                const actualizar = () => {
                    const p = plantillas.find(x => x.id === estado.plantilla) || plantillas[0];
                    const c = p.colores;
                    popup.querySelectorAll('.bono-plantilla').forEach(b => {
                        b.setAttribute('aria-pressed', String(b.dataset.plantilla === p.id));
                    });

                    const preview = $('#bonoPreview');
                    preview.style.backgroundImage = svgComoFondo(p.svg);

                    const logoEl = $('#bpLogo');
                    logoEl.hidden = !logo;
                    if (logo) logoEl.querySelector('img').src = logo;
                    const negocioEl = $('#bpNegocio');
                    negocioEl.style.left = logo ? '17%' : '4.44%';
                    negocioEl.style.color = c.nombre;
                    $('#bpNegocioNombre').textContent = negocio;
                    $('#bpEtiqueta').textContent = leerOrigen() === 'regalo' ? 'BONO DE REGALO' : 'BONO REDIMIBLE';

                    const titulo = $('#bpTitulo');
                    titulo.textContent = p.titulo;
                    titulo.style.color = c.titulo;
                    titulo.style.fontSize = p.titulo.length > 20 ? '4.07cqw' : '4.81cqw';

                    const para = $('#bonoParaInput').value.trim();
                    const de = $('#bonoDeInput').value.trim();
                    const dedicatoria = $('#bpDedicatoria');
                    dedicatoria.innerHTML = '';
                    const agregar = (rotulo, texto) => {
                        const b = document.createElement('b');
                        b.textContent = rotulo;
                        b.style.color = c.suave;
                        const s = document.createElement('span');
                        s.textContent = texto;
                        s.style.color = c.texto;
                        s.style.marginRight = '3cqw';
                        dedicatoria.append(b, s);
                    };
                    if (para) agregar('Para: ', para);
                    if (de) agregar('De: ', de);
                    dedicatoria.hidden = !(para || de);
                    dedicatoria.style.top = '47%';

                    const mensajeInput = $('#bonoMensajeInput');
                    mensajeInput.placeholder = p.mensajeSugerido;
                    $('#bonoMensajeContador').textContent = `${mensajeInput.value.length}/160`;
                    const mensaje = $('#bpMensaje');
                    mensaje.textContent = `“${mensajeInput.value.trim() || p.mensajeSugerido}”`;
                    mensaje.style.color = c.texto;
                    mensaje.style.top = para || de ? '53.5%' : '47%';

                    const vence = $('#bonoVenceInput')?.value || bono?.fecha_vencimiento || null;
                    const vig = $('#bpVigencia');
                    vig.textContent = formatoVigencia(vence);
                    vig.style.color = c.suave;
                    const pie = $('#bpPie');
                    pie.textContent = `Presenta este bono (código o QR) al pagar en ${negocio}.`;
                    pie.style.color = c.suave;

                    const valorEl = $('#bpValor');
                    valorEl.textContent = '$ ' + (leerValor() || 0).toLocaleString('es-CO');
                    valorEl.style.color = c.acento;
                };

                popup.querySelector('.bono-galeria').addEventListener('click', e => {
                    const b = e.target.closest('.bono-plantilla');
                    if (!b) return;
                    estado.plantilla = b.dataset.plantilla;
                    actualizar();
                });
                popup.addEventListener('input', actualizar);
                popup.addEventListener('change', actualizar);

                $('#bonoVerPdf').addEventListener('click', async () => {
                    // Se abre la pestaña ya (dentro del click) para que el navegador no la bloquee.
                    const win = window.open('', '_blank');
                    try {
                        const r = await fetch('/bonos/vista-previa', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                valor: leerValor(),
                                origen: leerOrigen(),
                                fecha_vencimiento: $('#bonoVenceInput')?.value || bono?.fecha_vencimiento || null,
                                plantilla: estado.plantilla,
                                destinatario: $('#bonoParaInput').value,
                                remitente: $('#bonoDeInput').value,
                                mensaje: $('#bonoMensajeInput').value
                            })
                        });
                        if (!r.ok) throw new Error('No se pudo generar la vista previa');
                        const url = URL.createObjectURL(await r.blob());
                        if (win) win.location.href = url;
                        else window.open(url, '_blank');
                    } catch (err) {
                        if (win) win.close();
                        Swal.showValidationMessage(err.message);
                    }
                });

                actualizar();
            },
            preConfirm: () => {
                const popup = Swal.getPopup();
                const $ = sel => popup.querySelector(sel);
                const diseno = {
                    plantilla: estado.plantilla,
                    destinatario: $('#bonoParaInput').value.trim(),
                    remitente: $('#bonoDeInput').value.trim(),
                    mensaje: $('#bonoMensajeInput').value.trim()
                };
                if (modo !== 'emitir') return diseno;

                const valorRaw = $('#bonoValorInput').value;
                const valor = window.MoneyInput ? window.MoneyInput.parse(valorRaw) : Number(valorRaw);
                if (!valor || valor <= 0) {
                    Swal.showValidationMessage('Ingresa el valor del bono');
                    $('#bonoValorInput').focus();
                    return false;
                }
                return {
                    ...diseno,
                    valor,
                    origen: popup.querySelector('input[name="bonoOrigen"]:checked').value,
                    fecha_vencimiento: $('#bonoVenceInput').value || null,
                    nota: $('#bonoNotaInput').value.trim()
                };
            }
        });
        return value || null;
    }

    function htmlComprobanteListo(url) {
        return url
            ? `<a href="${escapar(url)}" target="_blank" rel="noopener" class="btn btn-primary btn-sm mt-1"><i class="bi bi-file-earmark-pdf me-1"></i>Ver / descargar comprobante</a>`
            : '<p class="small text-warning mb-0">El comprobante no se pudo generar; puedes regenerarlo desde el detalle del bono.</p>';
    }

    async function nuevoBono() {
        const form = await abrirEditor('emitir');
        if (!form) return;

        Swal.fire({ title: 'Emitiendo bono...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const r = await fetch('/bonos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form)
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'No se pudo emitir el bono');

            Swal.fire({
                icon: 'success',
                title: 'Bono emitido',
                html: `<p>Código: <strong style="font-size:1.3rem">${escapar(data.codigo)}</strong></p><p class="text-muted small">Entrégaselo al cliente: lo va a necesitar para redimirlo.</p>${htmlComprobanteListo(data.imagen_url)}`,
                confirmButtonText: 'Listo'
            }).then(() => location.reload());
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        }
    }

    async function cambiarDiseno(bono) {
        const diseno = await abrirEditor('disenar', bono);
        if (!diseno) return;

        Swal.fire({ title: 'Generando comprobante...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const r = await fetch(`/bonos/${bono.id}/comprobante`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(diseno)
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'No se pudo regenerar el comprobante');
            Swal.fire({
                icon: 'success',
                title: 'Comprobante listo',
                html: htmlComprobanteListo(data.imagen_url),
                confirmButtonText: 'Listo'
            }).then(() => location.reload());
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        }
    }

    async function verMovimientos(fila) {
        const id = fila.dataset.id;
        try {
            const r = await fetch(`/bonos/${id}`);
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'No se pudo cargar el bono');

            const filas = (data.movimientos || [])
                .map(m => {
                    const signo = m.tipo === 'redencion' || m.tipo === 'anulacion' ? '-' : '+';
                    const etiqueta = { emision: 'Emisión', redencion: 'Redención', anulacion: 'Anulación' }[m.tipo] || m.tipo;
                    const fecha = m.created_at ? new Date(m.created_at).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' }) : '-';
                    const factura = m.factura_numero != null ? ` (Factura #${m.factura_numero})` : '';
                    return `<tr><td class="text-start">${etiqueta}${factura}</td><td class="text-muted small">${fecha}</td><td class="text-end">${signo}${fmt(m.monto)}</td></tr>`;
                })
                .join('');

            const puedeDisenar = document.getElementById('btnNuevoBono') && data.bono.estado !== 'anulado';
            const comprobanteHtml = `<p class="mb-2 d-flex gap-2 justify-content-center flex-wrap">
                    ${data.bono.imagen_url ? `<a class="btn btn-sm btn-outline-primary" href="${escapar(data.bono.imagen_url)}" target="_blank" rel="noopener"><i class="bi bi-file-earmark-pdf me-1"></i>Ver comprobante</a>` : ''}
                    ${puedeDisenar ? '<button type="button" class="btn btn-sm btn-outline-secondary" id="btnCambiarDiseno"><i class="bi bi-palette me-1"></i>Cambiar diseño / regenerar</button>' : ''}
                </p>`;
            Swal.fire({
                title: `<h5 class="mb-0"><i class="bi bi-gift me-2"></i>${data.bono.codigo}</h5>`,
                html: `
                    <p class="mb-2">Saldo actual: <strong>${fmt(data.bono.saldo_actual)}</strong> de ${fmt(data.bono.valor_inicial)}</p>
                    ${comprobanteHtml}
                    <div class="table-responsive"><table class="table table-sm"><tbody>${filas || '<tr><td colspan="3" class="text-center text-muted py-3">Sin movimientos</td></tr>'}</tbody></table></div>
                `,
                width: '520px',
                confirmButtonText: 'Cerrar',
                didOpen: popup => {
                    const btn = popup.querySelector('#btnCambiarDiseno');
                    if (btn) btn.addEventListener('click', () => cambiarDiseno({ ...data.bono, id }));
                }
            });
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        }
    }

    async function anularBono(fila) {
        const id = fila.dataset.id;
        const result = await Swal.fire({
            title: '¿Anular este bono?',
            text: 'El saldo restante quedará invalidado y no se podrá redimir.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            confirmButtonText: 'Sí, anular'
        });
        if (!result.isConfirmed) return;

        try {
            const r = await fetch(`/bonos/${id}/anular`, { method: 'PUT' });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'No se pudo anular');
            location.reload();
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        const btnNuevo = document.getElementById('btnNuevoBono');
        if (btnNuevo) btnNuevo.addEventListener('click', nuevoBono);

        const tbody = document.getElementById('bonosTbody');
        if (tbody) {
            tbody.addEventListener('click', function (event) {
                const fila = event.target.closest('tr[data-id]');
                if (!fila) return;
                if (event.target.closest('.btn-ver-bono')) {
                    verMovimientos(fila);
                } else if (event.target.closest('.btn-anular-bono')) {
                    anularBono(fila);
                }
            });
        }
    });
})();
