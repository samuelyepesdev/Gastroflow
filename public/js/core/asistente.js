/**
 * Panel del asistente: abrir/cerrar, burbujas, confirmación de escrituras.
 * Todo texto que viene del servidor entra con textContent (puede contener nombres de productos
 * o notas de clientes): nunca como HTML.
 */
(function () {
    const MAX_HISTORIAL = 6;
    const $ = id => document.getElementById(id);

    const fab = $('asistente-fab');
    const panel = $('asistente-panel');
    if (!fab || !panel || !window.AsistenteApi) {
        return;
    }
    const api = window.AsistenteApi;
    const lista = $('asistente-mensajes');
    const form = $('asistente-form');
    const campo = $('asistente-texto');
    const enviar = $('asistente-enviar');

    const historial = [];
    const oyentes = [];
    let ocupado = false;
    let nombreCargado = false;

    function burbuja(clase, texto) {
        const el = document.createElement('div');
        el.className = 'asistente-burbuja ' + clase;
        el.textContent = texto;
        lista.appendChild(el);
        lista.scrollTop = lista.scrollHeight;
        return el;
    }

    function recordar(rol, contenido) {
        historial.push({ role: rol, content: contenido });
        while (historial.length > MAX_HISTORIAL) {
            historial.shift();
        }
    }

    function fijarOcupado(valor) {
        ocupado = valor;
        enviar.disabled = valor;
        campo.disabled = valor;
        if (!valor) {
            campo.focus();
        }
    }

    function avisarRespuesta(texto) {
        oyentes.forEach(fn => fn(texto));
    }

    function botonesConfirmacion(contenedor, confirmationId) {
        const caja = document.createElement('div');
        caja.className = 'asistente-confirmar';
        const si = document.createElement('button');
        si.type = 'button';
        si.className = 'si';
        si.textContent = 'Confirmar';
        const no = document.createElement('button');
        no.type = 'button';
        no.className = 'no';
        no.textContent = 'Cancelar';

        async function resolver(aceptar) {
            si.disabled = true;
            no.disabled = true;
            const r = await api.confirmar(confirmationId, aceptar);
            caja.remove();
            mostrar(r);
        }
        si.addEventListener('click', () => resolver(true));
        no.addEventListener('click', () => resolver(false));
        caja.append(si, no);
        contenedor.appendChild(caja);
    }

    function mostrar(r) {
        const esError = r.tipo === 'error';
        const el = burbuja('asistente' + (esError ? ' error' : ''), r.texto || '');
        if (r.tipo === 'confirmacion' && r.confirmationId) {
            botonesConfirmacion(el, r.confirmationId);
        }
        if (!esError) {
            recordar('assistant', r.texto || '');
        }
        avisarRespuesta(r.texto || '');
    }

    async function enviarTexto(texto) {
        const limpio = String(texto || '').trim();
        if (!limpio || ocupado) {
            return null;
        }
        fijarOcupado(true);
        burbuja('usuario', limpio);
        const pensando = burbuja('asistente pensando', 'Pensando…');
        const previo = historial.slice();
        recordar('user', limpio);
        const r = await api.comando(limpio, previo);
        pensando.remove();
        mostrar(r);
        fijarOcupado(false);
        return r;
    }

    async function abrir() {
        panel.hidden = false;
        fab.setAttribute('aria-expanded', 'true');
        if (!nombreCargado) {
            nombreCargado = true;
            const nombre = await api.nombre();
            $('asistente-titulo').textContent = nombre;
            campo.placeholder = 'Dile algo a ' + nombre;
            fab.setAttribute('aria-label', 'Abrir ' + nombre);
            burbuja('asistente', 'Hola, soy ' + nombre + '. Dime un pedido o pregúntame por tus mesas.');
        }
        campo.focus();
    }

    function cerrar() {
        panel.hidden = true;
        fab.setAttribute('aria-expanded', 'false');
        fab.focus();
    }

    fab.addEventListener('click', () => (panel.hidden ? abrir() : cerrar()));
    $('asistente-cerrar').addEventListener('click', cerrar);
    panel.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            cerrar();
        }
    });
    form.addEventListener('submit', async e => {
        e.preventDefault();
        const texto = campo.value;
        campo.value = '';
        const r = await enviarTexto(texto);
        if (r && r.tipo === 'error') {
            // No se pierde lo escrito si falló: se devuelve al campo para reintentar.
            campo.value = texto;
        }
    });

    window.Asistente = {
        enviarTexto,
        // Mensaje del propio panel (no viene del modelo), p. ej. por qué falló el micrófono.
        avisar: texto => burbuja('asistente error', texto),
        alResponder: fn => oyentes.push(fn)
    };
})();
