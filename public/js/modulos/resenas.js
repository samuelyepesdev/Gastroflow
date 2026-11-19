/* Reseñas — panel interno. Usa GF.api / GF.escapeHtml (public/js/core/gf.js). */
(function () {
    'use strict';

    const CFG = window.RESENAS || {};
    const $ = id => document.getElementById(id);
    const esc = v => GF.escapeHtml(v == null ? '' : String(v));
    let filtro = 'todas';

    const estrellas = n => '★'.repeat(n) + '☆'.repeat(5 - n);
    const fecha = valor =>
        new Date(valor).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' });

    // ------------------------------------------------------------------ resumen

    function pintarResumen(r) {
        const cont = $('rsResumen');
        if (!r.total) {
            cont.innerHTML = `<p class="rs-vacio-resumen">Aún no hay opiniones en los últimos ${r.dias} días. Comparte tu enlace o QR para recibirlas.</p>`;
        } else {
            const filas = [5, 4, 3, 2, 1]
                .map(n => {
                    const cantidad = r.distribucion[n] || 0;
                    const pct = Math.round((cantidad / r.total) * 100);
                    return `<div class="rs-barra"><span>${n} ★</span><span class="rs-barra-pista"><span class="rs-barra-relleno" style="width:${pct}%"></span></span><span>${cantidad}</span></div>`;
                })
                .join('');
            cont.innerHTML = `
                <div class="rs-promedio">
                    <div class="rs-promedio-valor">${esc(String(r.promedio).replace('.', ','))}</div>
                    <div class="rs-promedio-estrellas" aria-hidden="true">${estrellas(Math.round(r.promedio))}</div>
                    <div class="rs-promedio-total">${r.total} ${r.total === 1 ? 'opinión' : 'opiniones'} · ${r.dias} días</div>
                </div>
                <div class="rs-barras">${filas}</div>`;
        }
        const badge = $('rsPorAtender');
        badge.textContent = r.bajas_pendientes;
        badge.classList.toggle('d-none', !r.bajas_pendientes);
    }

    // ------------------------------------------------------------------ lista

    function pintarLista(resenas) {
        const cont = $('rsLista');
        if (!resenas.length) {
            cont.innerHTML = `<div class="rs-vacio">${filtro === 'porAtender' ? 'No tienes reseñas por atender.' : 'Aún no hay opiniones.'}</div>`;
            return;
        }
        cont.innerHTML = resenas
            .map(r => {
                const baja = r.calificacion <= 3;
                const atendida = r.estado === 'atendida';
                const contacto = r.telefono
                    ? `<div class="rs-item-contacto"><i class="bi bi-whatsapp me-1" aria-hidden="true"></i><a href="https://wa.me/57${esc(r.telefono)}" target="_blank" rel="noopener noreferrer">${esc(r.nombre || r.telefono)} · ${esc(r.telefono)}</a></div>`
                    : r.nombre
                      ? `<div class="rs-item-contacto">${esc(r.nombre)}</div>`
                      : '';
                const accion =
                    CFG.puedeGestionar && baja
                        ? `<div class="rs-item-acciones"><button type="button" class="btn btn-sm ${atendida ? 'btn-outline-secondary' : 'btn-primary'}" data-id="${r.id}" data-atendida="${atendida ? '0' : '1'}">${atendida ? 'Reabrir' : 'Marcar atendida'}</button></div>`
                        : '';
                return `<article class="rs-item ${baja ? 'rs-item--baja' : ''} ${atendida ? 'rs-item--atendida' : ''}">
                    <div class="rs-item-cab">
                        <span class="rs-item-estrellas" role="img" aria-label="${r.calificacion} de 5 estrellas">${estrellas(r.calificacion)}</span>
                        <span class="rs-item-fecha">${esc(fecha(r.created_at))}${atendida ? ' · Atendida' : ''}</span>
                    </div>
                    ${r.comentario ? `<p class="rs-item-texto">${esc(r.comentario)}</p>` : ''}
                    ${contacto}
                    ${accion}
                </article>`;
            })
            .join('');
    }

    async function cargar() {
        const cont = $('rsLista');
        try {
            const query = filtro === 'porAtender' ? '?estado=nueva&bajas=1' : '';
            const { resenas, resumen } = await GF.api.get(`/resenas/data${query}`, 'No se pudieron cargar las reseñas');
            pintarResumen(resumen);
            pintarLista(resenas);
        } catch (e) {
            cont.innerHTML = `<div class="rs-vacio text-danger">${esc(e.message)}</div>`;
        }
    }

    document.querySelectorAll('.rs-filtro').forEach(btn => {
        btn.addEventListener('click', () => {
            filtro = btn.dataset.filtro;
            document.querySelectorAll('.rs-filtro').forEach(b => b.classList.toggle('activo', b === btn));
            cargar();
        });
    });

    $('rsLista').addEventListener('click', async evento => {
        const btn = evento.target.closest('button[data-id]');
        if (!btn) {
            return;
        }
        GF.cargando(btn, true);
        try {
            await GF.api.patch(`/resenas/${btn.dataset.id}/estado`, { atendida: btn.dataset.atendida === '1' }, 'No se pudo actualizar la reseña');
            await cargar();
        } catch (e) {
            GF.error(e.message);
            GF.cargando(btn, false);
        }
    });

    // ------------------------------------------------------------------ configuración

    function aplicarConfig(config) {
        $('cfgEnlace').value = config.enlace || '';
        if (config.qr) {
            $('cfgQr').src = config.qr;
            $('btnDescargarQr').href = config.qr;
        }
    }

    if (CFG.puedeConfigurar) {
        $('btnGuardarConfig').addEventListener('click', async () => {
            const btn = $('btnGuardarConfig');
            GF.cargando(btn, true);
            try {
                const { config } = await GF.api.put(
                    '/resenas/config',
                    {
                        activo: $('cfgActivo').checked,
                        google_url: $('cfgGoogle').value.trim(),
                        mensaje_gracias: $('cfgMensaje').value.trim()
                    },
                    'No se pudo guardar la configuración'
                );
                aplicarConfig(config);
                bootstrap.Modal.getInstance($('modalConfig'))?.hide();
                // Se recarga tras el aviso para que desaparezca (o aparezca) el banner de «página desactivada».
                await GF.exito('Configuración guardada');
                window.location.reload();
            } catch (e) {
                GF.error(e.message);
            } finally {
                GF.cargando(btn, false);
            }
        });

        $('btnCopiarEnlace').addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText($('cfgEnlace').value);
                GF.exito('Enlace copiado');
            } catch {
                $('cfgEnlace').select();
                GF.error('No se pudo copiar: selecciona el enlace y cópialo a mano');
            }
        });

        $('btnRegenerarEnlace').addEventListener('click', async () => {
            const ok = await GF.confirmar(
                'El enlace y el QR anteriores dejarán de funcionar. Si ya imprimiste el QR tendrás que imprimir el nuevo.',
                { titulo: '¿Cambiar el enlace?', confirmar: 'Sí, cambiar' }
            );
            if (!ok) {
                return;
            }
            try {
                const { config } = await GF.api.post('/resenas/config/enlace', {}, 'No se pudo cambiar el enlace');
                aplicarConfig(config);
                GF.exito('Enlace actualizado');
            } catch (e) {
                GF.error(e.message);
            }
        });
    }

    cargar();
})();
