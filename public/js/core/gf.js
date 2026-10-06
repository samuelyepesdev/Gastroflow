/**
 * GF - Núcleo compartido del frontend. Se carga en todas las pantallas (navbar
 * del tenant y shell del superadmin) ANTES de los scripts de cada módulo.
 *
 * Usar esto en vez de reescribir en cada archivo:
 *   GF.api(url, opciones, mensajeError)  fetch + JSON + manejo de errores
 *   GF.api.get/post/put/patch/delete     atajos; GF.api.getOr(url, porDefecto) no lanza
 *   GF.dinero(n)                         "$ 12.345" (pesos, sin decimales)
 *   GF.escapeHtml(texto)                 para insertar texto del usuario en HTML
 *   GF.toast(mensaje, icono)             aviso pequeño en la esquina
 *   GF.alerta / GF.exito / GF.error      diálogos (SweetAlert2)
 *   GF.handleError(err, fallback)        manejo y log centralizado de excepciones con alerta al usuario
 *   GF.tableError(tbody, cols, msg, err) estado de error en tabla y registro en consola
 *   GF.confirmar(mensaje, opciones)      true/false
 *   GF.cargando(boton, true|false)       spinner y deshabilitar un botón
 *   GF.tiempoReal.on(evento, handler)    eventos SSE del tenant (una sola conexión por página)
 *
 * SweetAlert2 lo carga cada vista al final del body: aquí solo se usa al
 * momento de llamar, nunca al cargar, así que el orden de scripts no importa.
 */
(function () {
    'use strict';

    // ---------- HTTP ----------

    /**
     * fetch con JSON y errores consistentes.
     * - `body` puede ser un objeto (se envía como JSON) o un FormData.
     * - Lanza Error con el mensaje del servidor (`error`/`message`) o `mensajeError`,
     *   con `.status` y `.data`. Si el servidor respondió HTML (sesión vencida,
     *   página de error) no revienta con "Unexpected token <": usa `mensajeError`.
     * - Devuelve el JSON de la respuesta (o null si no hay cuerpo JSON).
     */
    async function api(url, opciones, mensajeError) {
        const { body, headers, ...resto } = opciones || {};
        const init = { credentials: 'same-origin', ...resto, headers: { Accept: 'application/json', ...(headers || {}) } };
        if (body instanceof FormData) {
            init.body = body;
        } else if (body !== undefined) {
            init.headers['Content-Type'] = 'application/json';
            init.body = typeof body === 'string' ? body : JSON.stringify(body);
        }

        const resp = await fetch(url, init);
        const esJson = (resp.headers.get('content-type') || '').includes('application/json');
        const data = esJson ? await resp.json().catch(() => null) : null;

        if (!resp.ok) {
            const mensaje =
                (data && (data.error || data.message)) ||
                (resp.status === 401 ? 'Tu sesión expiró. Vuelve a iniciar sesión.' : null) ||
                mensajeError ||
                `Error ${resp.status}`;
            const error = new Error(mensaje);
            error.status = resp.status;
            error.data = data;
            throw error;
        }
        return data;
    }

    api.get = (url, mensajeError) => api(url, { method: 'GET' }, mensajeError);
    api.post = (url, body, mensajeError) => api(url, { method: 'POST', body }, mensajeError);
    api.put = (url, body, mensajeError) => api(url, { method: 'PUT', body }, mensajeError);
    api.patch = (url, body, mensajeError) => api(url, { method: 'PATCH', body }, mensajeError);
    api.delete = (url, mensajeError) => api(url, { method: 'DELETE' }, mensajeError);

    /**
     * GET que nunca lanza: devuelve `porDefecto` si falla (red o error HTTP).
     * Para datos accesorios de una pantalla (listas, estadísticas) cuya falla
     * no debe bloquearla.
     */
    api.getOr = (url, porDefecto) =>
        api(url).then(
            data => (data == null ? porDefecto : data),
            () => porDefecto
        );

    // ---------- Formato ----------

    /**
     * "$ 12.345". Pesos sin centavos (en COP no se usan). `decimalesMax` solo para
     * valores que sí pueden tener fracción, ej. costo unitario de un insumo: "$ 12,5".
     */
    function dinero(valor, decimalesMax) {
        const n = Number(valor) || 0;
        return '$ ' + n.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: decimalesMax || 0 });
    }

    function escapeHtml(texto) {
        return String(texto == null ? '' : texto)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // ---------- Avisos ----------

    function swal() {
        return typeof window.Swal !== 'undefined' ? window.Swal : null;
    }

    // Acepta también los nombres de Bootstrap que usaban algunos módulos.
    const ICONOS = { danger: 'error', primary: 'info', secondary: 'info', ok: 'success' };
    const icono = i => ICONOS[i] || i || 'info';

    // Movimiento de los toasts (arquetipo "Corporate"): entra decelerando (280ms),
    // sale acelerando y más rápido (180ms); el error añade un pequeño shake al llegar.
    // Con prefers-reduced-motion solo hay fundido.
    function inyectarEstilosToast() {
        if (document.getElementById('gf-toast-motion')) return;
        const css = document.createElement('style');
        css.id = 'gf-toast-motion';
        css.textContent = `
@keyframes gf-toast-in { from { opacity: 0; transform: translate3d(24px, 0, 0) scale(.98); } to { opacity: 1; transform: none; } }
@keyframes gf-toast-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: translate3d(16px, 0, 0) scale(.98); } }
@keyframes gf-toast-shake { 0%, 100% { translate: 0; } 20% { translate: -6px; } 40% { translate: 5px; } 60% { translate: -3px; } 80% { translate: 2px; } }
@keyframes gf-toast-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes gf-toast-fade-out { from { opacity: 1; } to { opacity: 0; } }
.swal2-popup.gf-toast-in { animation: gf-toast-in 280ms cubic-bezier(.2, 0, 0, 1) both; }
.swal2-popup.gf-toast-out { animation: gf-toast-out 180ms cubic-bezier(.3, 0, 1, 1) both; }
.swal2-popup.gf-toast-error.gf-toast-in { animation: gf-toast-in 280ms cubic-bezier(.2, 0, 0, 1) both, gf-toast-shake 320ms ease-in-out 280ms; }
@media (prefers-reduced-motion: reduce) {
  .swal2-popup.gf-toast-in, .swal2-popup.gf-toast-error.gf-toast-in { animation: gf-toast-fade-in 150ms linear both; }
  .swal2-popup.gf-toast-out { animation: gf-toast-fade-out 120ms linear both; }
}`;
        document.head.appendChild(css);
    }

    /** Aviso pequeño que se cierra solo. icono: success | error | warning | info */
    function toast(mensaje, tipo, opciones) {
        const S = swal();
        if (!S) {
            console.log(`[${icono(tipo)}] ${mensaje}`);
            return Promise.resolve();
        }
        inyectarEstilosToast();
        const ic = icono(tipo);
        return S.fire({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3000,
            timerProgressBar: true,
            icon: ic,
            title: mensaje,
            showClass: { popup: 'gf-toast-in' },
            hideClass: { popup: 'gf-toast-out' },
            customClass: { popup: ic === 'error' ? 'gf-toast-error' : '' },
            ...(opciones || {})
        });
    }

    function alerta(titulo, texto, tipo) {
        const S = swal();
        if (!S) {
            window.alert([titulo, texto].filter(Boolean).join('\n'));
            return Promise.resolve();
        }
        return S.fire({ icon: icono(tipo), title: titulo, text: texto || undefined });
    }

    /** GF.exito('Guardado') o GF.exito('Título', 'detalle'). Igual GF.error. */
    const exito = (a, b) => (b === undefined ? alerta('Listo', a, 'success') : alerta(a, b, 'success'));
    const error = (a, b) => {
        if (a instanceof Error) {
            console.error('[GastroFlow Error]:', a);
            return alerta('Error', a.message || 'Ha ocurrido un error inesperado', 'error');
        }
        if (b instanceof Error) {
            console.error(`[GastroFlow Error: ${a}]:`, b);
            return alerta(a, b.message || 'Ha ocurrido un error inesperado', 'error');
        }
        return b === undefined ? alerta('Error', a, 'error') : alerta(a, b, 'error');
    };

    /**
     * Manejador centralizado de excepciones en acciones / llamadas asíncronas.
     * Registra en consola con console.error y muestra un diálogo de error amigable al usuario.
     * @param {Error|string|any} err Excepción o error capturado
     * @param {string} [mensajeFallback] Mensaje por defecto si el error no tiene mensaje
     */
    function handleError(err, mensajeFallback = 'Ha ocurrido un error inesperado') {
        console.error('[GastroFlow Error]:', err);
        const mensaje = (err && (err.message || (typeof err === 'string' ? err : null))) || mensajeFallback;
        return alerta('Error', mensaje, 'error');
    }

    /**
     * Muestra una fila de error centrada en un <tbody> y registra la excepción en consola.
     * Útil en listados y tablas para evitar popups invasivos y mantener la traza técnica.
     * @param {HTMLElement|string} tbody Elemento tbody o su ID (sin #)
     * @param {number} colSpan Cantidad de columnas de la tabla
     * @param {string} [mensaje] Mensaje legible para el usuario
     * @param {Error|any} [err] Excepción técnica capturada (opcional)
     */
    function tableError(tbody, colSpan, mensaje = 'Error al cargar los datos', err = null) {
        if (err) {
            console.error('[GastroFlow Table Error]:', err);
        }
        const el = typeof tbody === 'string' ? document.getElementById(tbody) : tbody;
        if (!el) return;
        el.innerHTML = `<tr><td colspan="${colSpan}" class="text-center text-danger py-3">${escapeHtml(mensaje)}</td></tr>`;
    }

    /** Pregunta sí/no. Devuelve true si confirmó. */
    async function confirmar(mensaje, opciones) {
        const o = opciones || {};
        const S = swal();
        if (!S) return window.confirm(mensaje);
        const r = await S.fire({
            title: o.titulo || '¿Estás seguro?',
            text: mensaje,
            icon: icono(o.icono || 'warning'),
            showCancelButton: true,
            confirmButtonText: o.confirmar || 'Sí, continuar',
            cancelButtonText: o.cancelar || 'Cancelar',
            confirmButtonColor: o.peligro ? '#dc3545' : undefined
        });
        return r.isConfirmed;
    }

    // ---------- UI ----------

    /** Spinner + deshabilitado en un botón (elemento o selector). Guarda y restaura su contenido. */
    function cargando(boton, activo, texto) {
        const b = typeof boton === 'string' ? document.querySelector(boton) : boton && boton.jquery ? boton[0] : boton;
        if (!b) return;
        if (activo) {
            if (!b.dataset.gfHtml) b.dataset.gfHtml = b.innerHTML;
            b.disabled = true;
            b.innerHTML =
                '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>' +
                escapeHtml(texto || 'Procesando...');
        } else {
            b.disabled = false;
            if (b.dataset.gfHtml) {
                b.innerHTML = b.dataset.gfHtml;
                delete b.dataset.gfHtml;
            }
        }
    }

    /** Bloquea la pantalla con un spinner mientras dura una operación. Cerrar con GF.cerrarCargando(). */
    function cargandoPantalla(titulo) {
        const S = swal();
        if (!S) return;
        S.fire({ title: titulo || 'Cargando...', allowOutsideClick: false, didOpen: () => S.showLoading() });
    }

    function cerrarCargando() {
        const S = swal();
        if (S) S.close();
    }

    /** Cierra un modal de Bootstrap 5 por id (sin #). */
    function cerrarModal(id) {
        const el = document.getElementById(id);
        if (el && window.bootstrap) window.bootstrap.Modal.getOrCreateInstance(el).hide();
    }

    // ---------- Tiempo real (SSE del tenant) ----------

    /**
     * Una sola conexión a /api/notifications/subscribe por página, compartida
     * por todos los módulos que la necesiten. Se abre la primera vez que alguien
     * se suscribe (las pantallas que no la usan no abren nada).
     * handler recibe el objeto del evento ({ event, tenantId, pedidoId, ... }).
     * Evento especial 'connected': llega al conectar y en cada reconexión.
     */
    const tiempoReal = (function () {
        const handlers = {};
        let source = null;

        function conectar() {
            if (source || !window.EventSource) return;
            source = new EventSource('/api/notifications/subscribe');
            source.addEventListener('message', e => {
                let data;
                try {
                    data = JSON.parse(e.data);
                } catch (_err) {
                    return;
                }
                (handlers[data.event] || []).concat(handlers['*'] || []).forEach(h => {
                    try {
                        h(data);
                    } catch (err) {
                        console.error(`Error en handler de tiempo real (${data.event}):`, err);
                    }
                });
            });
            window.addEventListener('beforeunload', () => source && source.close());
        }

        return {
            on(evento, handler) {
                (handlers[evento] = handlers[evento] || []).push(handler);
                conectar();
            }
        };
    })();

    window.GF = {
        api,
        dinero,
        escapeHtml,
        toast,
        alerta,
        exito,
        error,
        handleError,
        tableError,
        confirmar,
        cargando,
        cargandoPantalla,
        cerrarCargando,
        cerrarModal,
        tiempoReal
    };
})();
