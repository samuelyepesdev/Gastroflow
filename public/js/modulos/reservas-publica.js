/* Reservas — página pública. Sin login: solo fetch propio y textContent (nunca innerHTML con datos). */
(function () {
    'use strict';

    const CFG = window.RESERVA_PUBLICA || {};
    const $ = id => document.getElementById(id);
    const base = `/reservar/${encodeURIComponent(CFG.token)}`;
    let consultaId = 0;
    let consultaMesasId = 0;

    function mostrarError(mensaje) {
        const el = $('rpError');
        el.textContent = mensaje || '';
        el.classList.toggle('d-none', !mensaje);
        if (mensaje) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    async function pedir(url, opciones) {
        const resp = await fetch(url, opciones);
        let datos = null;
        try {
            datos = await resp.json();
        } catch {
            /* respuesta sin JSON */
        }
        if (!resp.ok) {
            throw new Error((datos && datos.error) || 'No se pudo completar la solicitud. Intenta de nuevo.');
        }
        return datos;
    }

    async function cargarHoras() {
        const cont = $('rpHoras');
        const info = $('rpHorasInfo');
        const fecha = $('rpFecha').value;
        const personas = Number.parseInt($('rpPersonas').value, 10) || 1;
        const miConsulta = ++consultaId;
        info.textContent = '';
        if (!fecha) {
            cont.replaceChildren();
            return;
        }
        try {
            const { franjas } = await pedir(
                `${base}/disponibilidad?fecha=${encodeURIComponent(fecha)}&personas=${personas}`
            );
            if (miConsulta !== consultaId) return; // llegó una consulta más nueva
            const previa = (document.querySelector('input[name="hora"]:checked') || {}).value;
            cont.replaceChildren(
                ...franjas.map((f, i) => {
                    const caja = document.createElement('div');
                    caja.className = 'rp-hora';
                    const radio = document.createElement('input');
                    radio.type = 'radio';
                    radio.name = 'hora';
                    radio.id = `rpHora${i}`;
                    radio.value = f.hora;
                    radio.disabled = !f.disponible;
                    radio.checked = f.disponible && f.hora === previa;
                    const etiqueta = document.createElement('label');
                    etiqueta.htmlFor = radio.id;
                    etiqueta.textContent = f.hora;
                    caja.append(radio, etiqueta);
                    return caja;
                })
            );
            if (!franjas.some(f => f.disponible)) {
                info.textContent = 'No hay horarios disponibles ese día para esa cantidad de personas. Prueba otra fecha.';
            }
            cargarMesas();
        } catch (e) {
            if (miConsulta !== consultaId) return;
            cont.replaceChildren();
            info.textContent = e.message;
            cargarMesas();
        }
    }

    // Mesas libres a la hora elegida: las ocupadas o muy pequeñas no aparecen.
    async function cargarMesas() {
        if (!CFG.elegirMesa) return;
        const cont = $('rpMesas');
        const info = $('rpMesasInfo');
        const hora = (document.querySelector('input[name="hora"]:checked') || {}).value;
        const fecha = $('rpFecha').value;
        const personas = Number.parseInt($('rpPersonas').value, 10) || 1;
        const miConsulta = ++consultaMesasId;
        if (!hora || !fecha) {
            cont.replaceChildren();
            info.textContent = 'Elige primero la hora.';
            return;
        }
        try {
            const { mesas } = await pedir(
                `${base}/mesas?fecha=${encodeURIComponent(fecha)}&hora=${encodeURIComponent(hora)}&personas=${personas}`
            );
            if (miConsulta !== consultaMesasId) return;
            const previa = (document.querySelector('input[name="mesa_id"]:checked') || {}).value;
            cont.replaceChildren(
                ...mesas.map(m => {
                    const caja = document.createElement('div');
                    caja.className = 'rp-mesa';
                    const radio = document.createElement('input');
                    radio.type = 'radio';
                    radio.name = 'mesa_id';
                    radio.id = `rpMesa${m.id}`;
                    radio.value = String(m.id);
                    radio.checked = String(m.id) === previa;
                    const etiqueta = document.createElement('label');
                    etiqueta.htmlFor = radio.id;
                    const num = document.createElement('span');
                    num.className = 'rp-mesa-num';
                    num.textContent = `Mesa ${m.numero}`;
                    const cap = document.createElement('span');
                    cap.className = 'rp-mesa-cap';
                    cap.textContent = `Hasta ${m.capacidad} personas${m.descripcion ? ` · ${m.descripcion}` : ''}`;
                    etiqueta.append(num, cap);
                    caja.append(radio, etiqueta);
                    return caja;
                })
            );
            info.textContent = mesas.length
                ? ''
                : `No hay mesas libres a las ${hora} para ${personas} persona(s). Prueba otra hora.`;
        } catch (e) {
            if (miConsulta !== consultaMesasId) return;
            cont.replaceChildren();
            info.textContent = e.message;
        }
    }

    async function enviar(evento) {
        evento.preventDefault();
        mostrarError('');
        const form = $('rpForm');
        const hora = (document.querySelector('input[name="hora"]:checked') || {}).value;
        if (!hora) return mostrarError('Elige una hora.');
        if (CFG.elegirMesa && !document.querySelector('input[name="mesa_id"]:checked')) {
            return mostrarError('Elige una mesa.');
        }
        if (!$('rpNombre').value.trim()) return mostrarError('Escribe tu nombre.');
        if (!$('rpTelefono').value.trim()) return mostrarError('Escribe tu celular.');
        if (!$('rpConsent').checked) return mostrarError('Debes autorizar el tratamiento de tus datos para reservar.');

        const boton = $('rpEnviar');
        boton.disabled = true;
        try {
            const datos = Object.fromEntries(new FormData(form));
            datos.hora = hora;
            const r = await pedir(base, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(datos)
            });
            $('rpFormulario').classList.add('d-none');
            const listo = $('rpListo');
            $('rpListoTitulo').textContent = r.estado === 'confirmada' ? '¡Reserva confirmada!' : '¡Solicitud recibida!';
            $('rpListoTexto').textContent =
                r.estado === 'confirmada'
                    ? `Te esperamos el ${datos.fecha} a las ${hora}.`
                    : `Recibimos tu solicitud para el ${datos.fecha} a las ${hora}. El restaurante la confirmará contigo por llamada o WhatsApp.`;
            listo.classList.remove('d-none');
            listo.focus();
        } catch (e) {
            mostrarError(e.message);
            cargarHoras();
        } finally {
            boton.disabled = false;
        }
    }

    $('rpHoras').addEventListener('change', cargarMesas);
    $('rpFecha').addEventListener('change', cargarHoras);
    $('rpPersonas').addEventListener('change', cargarHoras);
    $('rpForm').addEventListener('submit', enviar);
    $('rpOtra').addEventListener('click', () => {
        $('rpListo').classList.add('d-none');
        $('rpFormulario').classList.remove('d-none');
        cargarHoras();
    });
    cargarHoras();
})();
