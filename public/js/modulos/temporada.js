/* Temporada — plantillas de promoción y vigencia por fechas. Usa GF.api / GF.escapeHtml. */
(function () {
    'use strict';

    const CFG = window.TEMPORADA || {};
    const $ = id => document.getElementById(id);
    const esc = v => GF.escapeHtml(v == null ? '' : String(v));
    let vigencias = CFG.vigencias || [];

    const fechaCorta = dia =>
        dia
            ? new Date(`${dia}T12:00:00Z`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
            : null;

    function textoVentana(v) {
        if (v.desde && v.hasta) return `${fechaCorta(v.desde)} → ${fechaCorta(v.hasta)}`;
        if (v.desde) return `Desde ${fechaCorta(v.desde)}`;
        return `Hasta ${fechaCorta(v.hasta)}`;
    }

    function pintarVigencias() {
        const cont = $('tpVigencias');
        if (!vigencias.length) {
            cont.innerHTML = '<p class="text-muted small mb-0">Aún no hay productos con fechas.</p>';
            return;
        }
        cont.innerHTML = vigencias
            .map(
                v => `<div class="tp-vig">
                    <div>
                        <strong>${esc(v.nombre)}</strong>${v.es_combo ? ' <span class="tp-etiqueta">Combo</span>' : ''}
                        <div class="tp-vig-ventana">${esc(textoVentana(v))}</div>
                    </div>
                    <span class="tp-estado ${v.disponible ? 'tp-estado--on' : ''}">${v.disponible ? 'Disponible' : 'No disponible'}</span>
                    <button type="button" class="btn btn-sm btn-outline-secondary" data-quitar="${esc(v.producto_id)}" aria-label="Quitar fechas de ${esc(v.nombre)}"><i class="bi bi-x-lg"></i></button>
                </div>`
            )
            .join('');
    }

    async function recargarVigencias() {
        try {
            ({ vigencias } = await GF.api.get('/temporada/vigencias', 'No se pudieron cargar las fechas'));
            pintarVigencias();
        } catch (e) {
            GF.error(e.message);
        }
    }

    function contarSeleccion() {
        const n = document.querySelectorAll('.tp-chk:checked').length;
        $('tpSeleccionados').textContent = `${n} seleccionado${n === 1 ? '' : 's'}`;
    }

    async function crearPromocion(boton) {
        const id = boton.dataset.plantilla;
        const caja = boton.closest('.tp-plantilla');
        GF.cargando(boton, true);
        try {
            const r = await GF.api.post(
                '/temporada/promocion',
                {
                    plantilla: id,
                    porcentaje: caja.querySelector('.tp-pct').value,
                    fecha_inicio: caja.querySelector('.tp-ini').value,
                    fecha_fin: caja.querySelector('.tp-fin').value
                },
                'No se pudo crear la promoción'
            );
            const ir = await GF.confirmar(
                `Se creó «${r.nombre}» (${r.porcentaje} %) desactivada. ¿Ir a Promociones para revisarla y activarla?`
            );
            if (ir) location.href = '/promociones';
        } catch (e) {
            GF.error(e.message);
        } finally {
            GF.cargando(boton, false);
        }
    }

    async function aplicar() {
        const ids = [...document.querySelectorAll('.tp-chk:checked')].map(c => Number(c.value));
        const boton = $('tpAplicar');
        GF.cargando(boton, true);
        try {
            const r = await GF.api.put(
                '/temporada/vigencias',
                { producto_ids: ids, desde: $('tpDesde').value || null, hasta: $('tpHasta').value || null },
                'No se pudieron guardar las fechas'
            );
            GF.toast(`Fechas aplicadas a ${r.aplicados} producto(s)`, 'success');
            document.querySelectorAll('.tp-chk:checked').forEach(c => (c.checked = false));
            contarSeleccion();
            recargarVigencias();
        } catch (e) {
            GF.error(e.message);
        } finally {
            GF.cargando(boton, false);
        }
    }

    async function quitar(productoId) {
        const ok = await GF.confirmar('¿Quitar las fechas? El producto conserva su estado actual.');
        if (!ok) return;
        try {
            await GF.api.delete(`/temporada/vigencias/${productoId}`, 'No se pudo quitar');
            recargarVigencias();
        } catch (e) {
            GF.error(e.message);
        }
    }

    async function guardarTema() {
        const boton = $('tmGuardar');
        GF.cargando(boton, true);
        try {
            const { tema } = await GF.api.put(
                '/temporada/tema',
                {
                    activo: $('tmActivo').checked,
                    desde: $('tmDesde').value || null,
                    hasta: $('tmHasta').value || null,
                    mensaje: $('tmMensaje').value,
                    animaciones: $('tmAnimaciones').checked,
                    panel: $('tmPanel').checked
                },
                'No se pudo guardar el look navideño'
            );
            GF.toast(tema.activo ? 'Look navideño activado' : 'Look navideño guardado (desactivado)', 'success');
        } catch (e) {
            GF.error(e.message);
        } finally {
            GF.cargando(boton, false);
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        $('tmGuardar').addEventListener('click', guardarTema);
        pintarVigencias();
        contarSeleccion();
        document.querySelectorAll('.tp-crear').forEach(b => b.addEventListener('click', () => crearPromocion(b)));
        $('tpAplicar').addEventListener('click', aplicar);
        $('tpProductos').addEventListener('change', contarSeleccion);
        $('tpBuscar').addEventListener('input', e => {
            const q = e.target.value.trim().toLowerCase();
            document.querySelectorAll('.tp-prod').forEach(el => {
                el.hidden = q !== '' && !el.dataset.nombre.includes(q);
            });
        });
        $('tpVigencias').addEventListener('click', e => {
            const b = e.target.closest('[data-quitar]');
            if (b) quitar(b.dataset.quitar);
        });
    });
})();
