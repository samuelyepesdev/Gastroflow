/**
 * gf-marca.js — Animaciones de marca (campana "Cloche") sobre GF.
 *
 *   GF.marca.cargando('Generando factura...')      -> devuelve cerrar()
 *   GF.marca.exito({ titulo, detalle, variante })  -> Promise (resuelve al cerrarse)
 *       variante: 'exito' (venta/factura, por defecto) | 'cocina' (pedido enviado)
 *
 * GF.cargandoPantalla / GF.cerrarCargando (gf.js) usan GF.marca.cargando cuando
 * este archivo está cargado, así que todas las esperas existentes toman la marca.
 * Estilos: public/css/core/gf-marca.css. Respeta prefers-reduced-motion.
 */
(function () {
    'use strict';

    if (!window.GF) return;

    var actual = null; // { el, cerrar }

    // Campana en SVG (viewBox 96): vapor detrás, domo (con perilla y brillo) y plato.
    function cloche(variante) {
        return (
            '<svg class="gf-cloche gf-cloche--' + variante + '" viewBox="0 0 96 96" aria-hidden="true">' +
            '<g class="c-vapor">' +
            '<path d="M35 64q-5-6 0-12t0-12"/><path d="M48 64q-5-6 0-12t0-12"/><path d="M61 64q-5-6 0-12t0-12"/>' +
            '</g>' +
            '<g class="c-check"><circle cx="48" cy="57" r="12"/><path d="M42 57.5l4.6 4.6 8.2-9.4"/></g>' +
            '<g class="c-domo">' +
            '<path fill="currentColor" d="M12 66a36 36 0 0 1 72 0z"/>' +
            '<circle fill="currentColor" cx="48" cy="21.5" r="6.3"/>' +
            '<path d="M27 56a22 22 0 0 1 14-14" fill="none" stroke="#fff4e8" stroke-width="4.5" stroke-linecap="round"/>' +
            '</g>' +
            '<rect x="6" y="70" width="84" height="9" rx="4.5" fill="#ff5a36"/>' +
            '</svg>'
        );
    }

    function quitarActual(rapido) {
        if (!actual) return;
        var el = actual.el;
        actual = null;
        if (rapido) {
            el.remove();
            return;
        }
        el.classList.add('is-saliendo');
        setTimeout(function () { el.remove(); }, 220);
    }

    function montar(variante, titulo, detalle) {
        quitarActual(true);
        var el = document.createElement('div');
        el.className = 'gf-marca';
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        el.innerHTML =
            '<div class="gf-marca__card">' +
            cloche(variante) +
            '<p class="gf-marca__titulo">' + GF.escapeHtml(titulo || '') + '</p>' +
            (detalle ? '<p class="gf-marca__detalle">' + GF.escapeHtml(detalle) + '</p>' : '') +
            '</div>';
        document.body.appendChild(el);
        return el;
    }

    /** Pantalla de espera con la campana levantándose. Devuelve la función que la cierra. */
    function cargando(texto) {
        var el = montar('carga', texto || 'Cargando...');
        var registro = {
            el: el,
            cerrar: function () {
                if (actual === registro) quitarActual(false);
            }
        };
        actual = registro;
        return registro.cerrar;
    }

    /**
     * Confirmación animada. Se cierra sola (duracion ms, 1700 por defecto), con clic o con Escape.
     * @returns {Promise<void>}
     */
    function exito(opciones) {
        var o = opciones || {};
        var variante = o.variante === 'cocina' ? 'cocina' : 'exito';
        var reducido = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        var duracion = o.duracion || (reducido ? 1200 : 1700);

        return new Promise(function (resolve) {
            var el = montar(variante, o.titulo || '¡Listo!', o.detalle);
            var cerrado = false;
            var registro = { el: el };
            var cerrar = function () {
                if (cerrado) return;
                cerrado = true;
                document.removeEventListener('keydown', alTeclado);
                if (actual === registro) quitarActual(false);
                resolve();
            };
            var alTeclado = function (e) { if (e.key === 'Escape') cerrar(); };
            registro.cerrar = cerrar;
            actual = registro;
            el.addEventListener('click', cerrar);
            document.addEventListener('keydown', alTeclado);
            setTimeout(cerrar, duracion);
        });
    }

    /** Opciones para Swal.fire: reemplaza el ícono de éxito por la campana animada. */
    function swalIcono(variante) {
        return {
            iconHtml: cloche(variante === 'cocina' ? 'cocina' : 'exito'),
            customClass: { icon: 'gf-swal-marca' }
        };
    }

    GF.marca = { cargando: cargando, exito: exito, cloche: cloche, swalIcono: swalIcono };
})();
