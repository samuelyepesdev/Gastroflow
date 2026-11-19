/* Superadmin — Look de temporada: interruptor global y estado por restaurante. */
(function () {
    'use strict';

    const $ = id => document.getElementById(id);

    async function guardarGlobal() {
        const boton = $('tgGuardar');
        GF.cargando(boton, true);
        try {
            await GF.api.put(
                '/admin/temporada/global',
                {
                    activo: $('tgActivo').checked,
                    desde: $('tgDesde').value || null,
                    hasta: $('tgHasta').value || null,
                    mensaje: $('tgMensaje').value,
                    animaciones: $('tgAnimaciones').checked,
                    panel: $('tgPanel').checked
                },
                'No se pudo guardar el look de temporada'
            );
            GF.toast($('tgActivo').checked ? 'Look activado para todos' : 'Look global guardado (apagado)', 'success');
            // Los chips «Se ve / No se ve» dependen de lo global y de las fechas: se recalculan en el servidor.
            setTimeout(() => location.reload(), 700);
        } catch (e) {
            GF.error(e.message);
        } finally {
            GF.cargando(boton, false);
        }
    }

    async function cambiarEstado(select) {
        const anterior = select.dataset.anterior;
        select.disabled = true;
        try {
            await GF.api.put(
                `/admin/temporada/restaurantes/${select.dataset.id}`,
                { estado: select.value },
                'No se pudo cambiar el estado del restaurante'
            );
            select.dataset.anterior = select.value;
            GF.toast('Restaurante actualizado', 'success');
            setTimeout(() => location.reload(), 500);
        } catch (e) {
            select.value = anterior;
            GF.error(e.message);
        } finally {
            select.disabled = false;
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        $('tgGuardar').addEventListener('click', guardarGlobal);
        document.querySelectorAll('.tg-estado').forEach(s => {
            s.dataset.anterior = s.value;
            s.addEventListener('change', () => cambiarEstado(s));
        });
        $('trBuscar').addEventListener('input', e => {
            const q = e.target.value.trim().toLowerCase();
            document.querySelectorAll('#trLista tr').forEach(tr => {
                tr.hidden = q !== '' && !tr.dataset.nombre.includes(q);
            });
        });
    });
})();
