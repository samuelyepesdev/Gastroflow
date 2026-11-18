/* Reservas — página pública, por pasos. Sin login: solo fetch propio y textContent (nunca innerHTML con datos). */
(function () {
    'use strict';

    const CFG = window.RESERVA_PUBLICA || {};
    const $ = id => document.getElementById(id);
    const base = `/reservar/${encodeURIComponent(CFG.token)}`;
    const MAX = Number(CFG.maxPersonas) || 12;
    let consultaHoras = 0;
    let consultaMesas = 0;
    let personas = 2;

    const sumarDias = (dia, n) => {
        const d = new Date(`${dia}T12:00:00Z`);
        d.setUTCDate(d.getUTCDate() + n);
        return d.toISOString().slice(0, 10);
    };
    const fechaCorta = dia =>
        new Date(`${dia}T12:00:00Z`).toLocaleDateString('es-CO', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            timeZone: 'UTC'
        });
    const horaElegida = () => (document.querySelector('input[name="hora"]:checked') || {}).value || '';
    const mesaElegida = () => document.querySelector('input[name="mesa_id"]:checked');
    const plural = n => `${n} ${n === 1 ? 'persona' : 'personas'}`;

    function mostrarError(mensaje) {
        const el = $('rpError');
        el.textContent = mensaje || '';
        el.classList.toggle('d-none', !mensaje);
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

    // ------------------------------------------------------------------ pasos y resumen

    /** Desbloquea mesa y datos según lo ya elegido, y actualiza el resumen. */
    function actualizarPasos() {
        const hora = horaElegida();
        const mesa = mesaElegida();
        const mesaOk = !CFG.elegirMesa || !!mesa;
        const pasoMesa = $('rpPasoMesa');
        if (pasoMesa) pasoMesa.classList.toggle('rp-bloqueado', !hora);
        const datosListos = !!hora && mesaOk;
        $('rpPasoDatos').classList.toggle('rp-bloqueado', !datosListos);
        $('rpDatos').disabled = !datosListos;
        $('rpDatosAyuda').classList.toggle('d-none', datosListos);

        const partes = [];
        if (hora) {
            if (mesa) partes.push(mesa.dataset.etiqueta);
            partes.push(plural(personas), fechaCorta($('rpFecha').value), hora);
        }
        $('rpResumen').textContent = datosListos ? `Tu reserva: ${partes.join(' · ')}` : '';
        $('rpResumen').classList.toggle('d-none', !datosListos);
    }

    function fijarPersonas(n) {
        personas = Math.min(MAX, Math.max(1, n));
        $('rpPersonas').value = String(personas);
        $('rpPersonasTxt').textContent = String(personas);
        $('rpMenos').disabled = personas <= 1;
        $('rpMas').disabled = personas >= MAX;
        cargarHoras();
    }

    function marcarChips() {
        const fecha = $('rpFecha').value;
        document.querySelectorAll('.rp-chip').forEach(c => {
            c.classList.toggle('activo', sumarDias(CFG.hoy, Number(c.dataset.dia)) === fecha);
        });
    }

    // ------------------------------------------------------------------ horas (solo las que tienen lugar)

    async function cargarHoras() {
        const cont = $('rpHoras');
        const info = $('rpHorasInfo');
        const fecha = $('rpFecha').value;
        const miConsulta = ++consultaHoras;
        marcarChips();
        info.textContent = '';
        if (!fecha) {
            cont.replaceChildren();
            actualizarPasos();
            return;
        }
        try {
            const { franjas } = await pedir(
                `${base}/disponibilidad?fecha=${encodeURIComponent(fecha)}&personas=${personas}`
            );
            if (miConsulta !== consultaHoras) return; // llegó una consulta más nueva
            const previa = horaElegida();
            const libres = franjas.filter(f => f.disponible);
            cont.replaceChildren(
                ...libres.map((f, i) => {
                    const caja = document.createElement('div');
                    caja.className = 'rp-hora';
                    const radio = document.createElement('input');
                    radio.type = 'radio';
                    radio.name = 'hora';
                    radio.id = `rpHora${i}`;
                    radio.value = f.hora;
                    radio.checked = f.hora === previa;
                    const etiqueta = document.createElement('label');
                    etiqueta.htmlFor = radio.id;
                    etiqueta.textContent = f.hora;
                    caja.append(radio, etiqueta);
                    return caja;
                })
            );
            info.textContent = libres.length
                ? ''
                : `No hay horarios para ${plural(personas)} ese día. Prueba otro día o menos personas.`;
        } catch (e) {
            if (miConsulta !== consultaHoras) return;
            cont.replaceChildren();
            info.textContent = e.message;
        }
        cargarMesas();
        actualizarPasos();
    }

    // ------------------------------------------------------------------ mesas (solo las libres a esa hora)

    async function cargarMesas() {
        if (!CFG.elegirMesa) return;
        const cont = $('rpMesas');
        const info = $('rpMesasInfo');
        const hora = horaElegida();
        const fecha = $('rpFecha').value;
        const miConsulta = ++consultaMesas;
        if (!hora || !fecha) {
            cont.replaceChildren();
            info.textContent = 'Primero elige la hora.';
            actualizarPasos();
            return;
        }
        try {
            const { mesas } = await pedir(
                `${base}/mesas?fecha=${encodeURIComponent(fecha)}&hora=${encodeURIComponent(hora)}&personas=${personas}`
            );
            if (miConsulta !== consultaMesas) return;
            const previa = (mesaElegida() || {}).value;
            cont.replaceChildren(
                ...mesas.map(m => {
                    const caja = document.createElement('div');
                    caja.className = 'rp-mesa';
                    const radio = document.createElement('input');
                    radio.type = 'radio';
                    radio.name = 'mesa_id';
                    radio.id = `rpMesa${m.id}`;
                    radio.value = String(m.id);
                    radio.dataset.etiqueta = `Mesa ${m.numero}`;
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
                ? 'Toca la mesa que prefieras.'
                : `No hay mesas libres a las ${hora} para ${plural(personas)}. Prueba otra hora.`;
        } catch (e) {
            if (miConsulta !== consultaMesas) return;
            cont.replaceChildren();
            info.textContent = e.message;
        }
        actualizarPasos();
    }

    // ------------------------------------------------------------------ enviar

    async function enviar(evento) {
        evento.preventDefault();
        mostrarError('');
        const hora = horaElegida();
        const mesa = mesaElegida();
        if (!hora) return mostrarError('Elige una hora.');
        if (CFG.elegirMesa && !mesa) return mostrarError('Elige una mesa.');
        if (!$('rpNombre').value.trim()) return mostrarError('Escribe tu nombre.');
        if (!$('rpTelefono').value.trim()) return mostrarError('Escribe tu celular.');
        if (!$('rpConsent').checked) return mostrarError('Marca la autorización para poder reservar.');

        const boton = $('rpEnviar');
        boton.disabled = true;
        try {
            const datos = Object.fromEntries(new FormData($('rpForm')));
            datos.hora = hora;
            const resumen = [mesa ? mesa.dataset.etiqueta : null, plural(personas), fechaCorta(datos.fecha), hora]
                .filter(Boolean)
                .join(' · ');
            const r = await pedir(base, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(datos)
            });
            $('rpFormulario').classList.add('d-none');
            $('rpListoTitulo').textContent = r.estado === 'confirmada' ? '¡Reserva confirmada!' : '¡Solicitud recibida!';
            $('rpListoResumen').textContent = resumen;
            $('rpListoTexto').textContent =
                r.estado === 'confirmada'
                    ? 'Te esperamos. Si algo cambia, escríbenos o llámanos.'
                    : 'El restaurante la confirmará contigo por WhatsApp o llamada.';
            const listo = $('rpListo');
            listo.classList.remove('d-none');
            listo.focus();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (e) {
            mostrarError(e.message);
            cargarHoras(); // el cupo pudo cambiar: se refrescan horas y mesas
        } finally {
            boton.disabled = false;
        }
    }

    // ------------------------------------------------------------------ eventos

    $('rpMenos').addEventListener('click', () => fijarPersonas(personas - 1));
    $('rpMas').addEventListener('click', () => fijarPersonas(personas + 1));
    $('rpFecha').addEventListener('change', cargarHoras);
    document.querySelectorAll('.rp-chip').forEach(c =>
        c.addEventListener('click', () => {
            $('rpFecha').value = sumarDias(CFG.hoy, Number(c.dataset.dia));
            cargarHoras();
        })
    );
    $('rpHoras').addEventListener('change', () => {
        cargarMesas();
        actualizarPasos();
    });
    if ($('rpMesas')) $('rpMesas').addEventListener('change', actualizarPasos);
    $('rpForm').addEventListener('submit', enviar);
    $('rpOtra').addEventListener('click', () => {
        $('rpListo').classList.add('d-none');
        $('rpFormulario').classList.remove('d-none');
        cargarHoras();
    });

    fijarPersonas(Math.min(2, MAX));
})();
