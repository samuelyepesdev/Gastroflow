/* Reservas — panel interno. Usa GF.api / GF.escapeHtml (public/js/core/gf.js). */
(function () {
    'use strict';

    const CFG = window.RESERVAS || {};
    const ESTADOS = {
        pendiente: { etiqueta: 'Pendiente', acciones: ['confirmada', 'cancelada'] },
        confirmada: { etiqueta: 'Confirmada', acciones: ['sentada', 'no_show', 'cancelada'] },
        sentada: { etiqueta: 'Llegó', acciones: [] },
        cancelada: { etiqueta: 'Cancelada', acciones: [] },
        no_show: { etiqueta: 'No se presentó', acciones: [] }
    };
    const ACCION = {
        confirmada: { texto: 'Confirmar', icono: 'bi-check2-circle', clase: 'btn-primary' },
        sentada: { texto: 'Llegó', icono: 'bi-person-check', clase: 'btn-outline-secondary' },
        no_show: { texto: 'No llegó', icono: 'bi-person-x', clase: 'btn-outline-secondary' },
        cancelada: { texto: 'Cancelar', icono: 'bi-x-circle', clase: 'btn-outline-secondary' }
    };
    const OCASION = {
        cumpleanos: 'Cumpleaños',
        aniversario: 'Aniversario',
        empresarial: 'Empresarial',
        navidad: 'Navidad / Fin de año',
        otra: 'Otra'
    };

    const $ = id => document.getElementById(id);
    const esc = v => GF.escapeHtml(v == null ? '' : String(v));
    let fechaActual = CFG.hoy;
    let mesas = [];
    let configEnlace = CFG.enlaceBase || null;

    const sumarDias = (dia, n) => {
        const d = new Date(`${dia}T12:00:00Z`);
        d.setUTCDate(d.getUTCDate() + n);
        return d.toISOString().slice(0, 10);
    };

    const fechaLarga = dia =>
        new Date(`${dia}T12:00:00Z`).toLocaleDateString('es-CO', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            timeZone: 'UTC'
        });

    // ------------------------------------------------------------------ lista

    async function cargar() {
        const cont = $('rvLista');
        try {
            const { reservas } = await GF.api.get(
                `/reservas/data?desde=${fechaActual}&hasta=${fechaActual}`,
                'No se pudieron cargar las reservas'
            );
            pintar(reservas);
        } catch (e) {
            cont.innerHTML = `<div class="rv-vacio text-danger">${esc(e.message)}</div>`;
        }
    }

    function pintar(reservas) {
        const activas = reservas.filter(r => r.estado !== 'cancelada' && r.estado !== 'no_show');
        const personas = activas.reduce((s, r) => s + r.personas, 0);
        $('rvResumen').textContent = reservas.length
            ? `${fechaLarga(fechaActual)} · ${activas.length} reserva(s) · ${personas} persona(s)`
            : fechaLarga(fechaActual);

        if (!reservas.length) {
            $('rvLista').innerHTML = '<div class="rv-vacio"><i class="bi bi-calendar2"></i><p>No hay reservas para este día.</p></div>';
            return;
        }
        $('rvLista').innerHTML = reservas.map(tarjeta).join('');
    }

    function tarjeta(r) {
        const est = ESTADOS[r.estado];
        const acciones = CFG.puedeGestionar
            ? est.acciones
                  .map(a => {
                      const x = ACCION[a];
                      return `<button type="button" class="btn btn-sm ${x.clase}" data-accion="estado" data-id="${r.id}" data-estado="${a}"><i class="bi ${x.icono} me-1"></i>${x.texto}</button>`;
                  })
                  .join('')
            : '';
        const mesa = r.mesa_numero ? `Mesa ${esc(r.mesa_numero)}` : 'Sin mesa';
        const selMesa =
            CFG.puedeGestionar && (r.estado === 'pendiente' || r.estado === 'confirmada')
                ? `<select class="form-select form-select-sm rv-mesa-sel" data-accion="mesa" data-id="${r.id}" aria-label="Mesa de ${esc(r.nombre)}">
                        <option value="">Sin mesa</option>${mesas
                            .map(m => `<option value="${m.id}" ${m.id === r.mesa_id ? 'selected' : ''}>Mesa ${esc(m.numero)}</option>`)
                            .join('')}</select>`
                : `<span class="rv-dato">${mesa}</span>`;
        const wa = `https://wa.me/57${esc(r.telefono)}?text=${encodeURIComponent(
            `Hola ${r.nombre}, te escribimos de ${CFG.nombreRestaurante || 'el restaurante'} sobre tu reserva del ${fechaLarga(r.fecha)} a las ${r.hora_inicio} para ${r.personas} persona(s).`
        )}`;
        return `<article class="rv-item rv-item--${esc(r.estado)}">
            <div class="rv-hora">${esc(r.hora_inicio)}</div>
            <div class="rv-cuerpo">
                <div class="rv-linea">
                    <strong class="rv-nombre">${esc(r.nombre)}</strong>
                    <span class="rv-chip rv-chip--${esc(r.estado)}">${est.etiqueta}</span>
                    ${r.origen === 'publica' ? '<span class="rv-chip rv-chip--web"><i class="bi bi-globe2"></i> Web</span>' : ''}
                    ${r.ocasion ? `<span class="rv-chip rv-chip--ocasion">${esc(OCASION[r.ocasion] || r.ocasion)}</span>` : ''}
                </div>
                <div class="rv-linea rv-sec">
                    <span class="rv-dato"><i class="bi bi-people"></i> ${esc(r.personas)}</span>
                    <a class="rv-dato" href="tel:${esc(r.telefono)}"><i class="bi bi-telephone"></i> ${esc(r.telefono)}</a>
                    <a class="rv-dato" href="${wa}" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i> WhatsApp</a>
                    ${selMesa}
                </div>
                ${r.notas ? `<div class="rv-notas"><i class="bi bi-chat-left-text"></i> ${esc(r.notas)}</div>` : ''}
            </div>
            <div class="rv-acciones">${acciones}</div>
        </article>`;
    }

    async function cambiarEstado(id, estado) {
        if (estado === 'cancelada' || estado === 'no_show') {
            const ok = await GF.confirmar(
                estado === 'cancelada' ? '¿Cancelar esta reserva?' : '¿Marcar que el cliente no se presentó?'
            );
            if (!ok) return;
        }
        try {
            await GF.api.patch(`/reservas/${id}/estado`, { estado }, 'No se pudo cambiar el estado');
            GF.toast('Reserva actualizada', 'success');
            cargar();
        } catch (e) {
            GF.error(e.message);
        }
    }

    async function asignarMesa(id, mesaId) {
        try {
            await GF.api.patch(`/reservas/${id}/mesa`, { mesa_id: mesaId || null }, 'No se pudo asignar la mesa');
            GF.toast('Mesa actualizada', 'success');
        } catch (e) {
            GF.error(e.message);
            cargar();
        }
    }

    // ------------------------------------------------------------------ nueva reserva

    async function cargarHoras() {
        const sel = $('rvHora');
        const info = $('rvDisponibilidadInfo');
        const fecha = $('rvFechaNueva').value;
        const personas = Number.parseInt($('rvPersonas').value, 10) || 1;
        if (!fecha) return;
        try {
            const { franjas } = await GF.api.get(
                `/reservas/disponibilidad?fecha=${encodeURIComponent(fecha)}&personas=${personas}`,
                'No se pudo consultar la disponibilidad'
            );
            const previa = sel.value;
            sel.innerHTML = franjas
                .map(f => `<option value="${esc(f.hora)}" ${f.disponible ? '' : 'class="rv-opt-lleno"'}>${esc(f.hora)}${f.disponible ? '' : ' (sin cupo)'}</option>`)
                .join('');
            if (previa && franjas.some(f => f.hora === previa)) sel.value = previa;
            else {
                const primera = franjas.find(f => f.disponible);
                if (primera) sel.value = primera.hora;
            }
            info.textContent = franjas.some(f => f.disponible)
                ? ''
                : 'No hay horarios con cupo para ese día. Puedes forzar la reserva con la opción de abajo.';
        } catch (e) {
            sel.innerHTML = '';
            info.textContent = e.message;
        }
    }

    function abrirNueva() {
        ['rvNombre', 'rvTelefono', 'rvNotas'].forEach(id => ($(id).value = ''));
        $('rvPersonas').value = 2;
        $('rvFechaNueva').value = fechaActual < CFG.hoy ? CFG.hoy : fechaActual;
        $('rvOcasion').value = '';
        $('rvMesa').value = '';
        $('rvForzar').checked = false;
        cargarHoras();
    }

    async function guardarNueva() {
        const btn = $('btnGuardarReserva');
        GF.cargando(btn, true);
        try {
            await GF.api.post(
                '/reservas',
                {
                    nombre: $('rvNombre').value,
                    telefono: $('rvTelefono').value,
                    personas: $('rvPersonas').value,
                    fecha: $('rvFechaNueva').value,
                    hora: $('rvHora').value,
                    mesa_id: $('rvMesa').value || null,
                    ocasion: $('rvOcasion').value || null,
                    notas: $('rvNotas').value,
                    forzar: $('rvForzar').checked
                },
                'No se pudo crear la reserva'
            );
            bootstrap.Modal.getInstance($('modalReserva')).hide();
            GF.toast('Reserva creada', 'success');
            fechaActual = $('rvFechaNueva').value;
            $('rvFecha').value = fechaActual;
            cargar();
        } catch (e) {
            GF.error(e.message);
        } finally {
            GF.cargando(btn, false);
        }
    }

    // ------------------------------------------------------------------ configuración

    function pintarEnlace() {
        const input = $('cfgEnlace');
        if (input) input.value = configEnlace ? `${location.origin}${configEnlace}` : '';
    }

    async function guardarConfig() {
        const btn = $('btnGuardarConfig');
        GF.cargando(btn, true);
        try {
            const { config } = await GF.api.put(
                '/reservas/config',
                {
                    activo: $('cfgActivo').checked,
                    aforo_maximo: $('cfgAforo').value,
                    duracion_min: $('cfgDuracion').value,
                    intervalo_min: $('cfgIntervalo').value,
                    max_personas_reserva: $('cfgMaxPersonas').value,
                    hora_apertura: $('cfgApertura').value,
                    hora_ultima: $('cfgUltima').value,
                    anticipacion_min_horas: $('cfgAnticipacion').value,
                    dias_max_adelanto: $('cfgDiasAdelanto').value,
                    mensaje_publico: $('cfgMensaje').value,
                    auto_confirmar: $('cfgAutoConfirmar').checked
                },
                'No se pudo guardar la configuración'
            );
            configEnlace = config.enlace;
            pintarEnlace();
            GF.toast('Configuración guardada', 'success');
            bootstrap.Modal.getInstance($('modalConfig')).hide();
        } catch (e) {
            GF.error(e.message);
        } finally {
            GF.cargando(btn, false);
        }
    }

    async function regenerarEnlace() {
        const ok = await GF.confirmar('El enlace actual dejará de funcionar. ¿Generar uno nuevo?');
        if (!ok) return;
        try {
            const { config } = await GF.api.post('/reservas/config/enlace', {}, 'No se pudo cambiar el enlace');
            configEnlace = config.enlace;
            pintarEnlace();
            GF.toast('Enlace nuevo generado', 'success');
        } catch (e) {
            GF.error(e.message);
        }
    }

    async function copiarEnlace() {
        try {
            await navigator.clipboard.writeText($('cfgEnlace').value);
            GF.toast('Enlace copiado', 'success');
        } catch {
            $('cfgEnlace').select();
            GF.toast('Selecciona y copia el enlace', 'info');
        }
    }

    // ------------------------------------------------------------------ init

    function irA(dia) {
        fechaActual = dia;
        $('rvFecha').value = dia;
        cargar();
    }

    async function init() {
        $('rvAyer').addEventListener('click', () => irA(sumarDias(fechaActual, -1)));
        $('rvManana').addEventListener('click', () => irA(sumarDias(fechaActual, 1)));
        $('rvHoy').addEventListener('click', () => irA(CFG.hoy));
        $('rvFecha').addEventListener('change', e => e.target.value && irA(e.target.value));

        $('rvLista').addEventListener('click', e => {
            const b = e.target.closest('[data-accion="estado"]');
            if (b) cambiarEstado(Number(b.dataset.id), b.dataset.estado);
        });
        $('rvLista').addEventListener('change', e => {
            const s = e.target.closest('[data-accion="mesa"]');
            if (s) asignarMesa(Number(s.dataset.id), s.value);
        });

        if (CFG.puedeGestionar) {
            try {
                ({ mesas } = await GF.api.get('/reservas/mesas', 'No se pudieron cargar las mesas'));
                $('rvMesa').innerHTML =
                    '<option value="">Sin asignar</option>' +
                    mesas.map(m => `<option value="${m.id}">Mesa ${esc(m.numero)}</option>`).join('');
            } catch {
                mesas = [];
            }
            $('modalReserva').addEventListener('show.bs.modal', abrirNueva);
            $('rvFechaNueva').addEventListener('change', cargarHoras);
            $('rvPersonas').addEventListener('change', cargarHoras);
            $('btnGuardarReserva').addEventListener('click', guardarNueva);
        }
        if (CFG.puedeConfigurar) {
            pintarEnlace();
            $('btnGuardarConfig').addEventListener('click', guardarConfig);
            $('btnRegenerarEnlace').addEventListener('click', regenerarEnlace);
            $('btnCopiarEnlace').addEventListener('click', copiarEnlace);
        }
        cargar();
    }

    document.addEventListener('DOMContentLoaded', init);
})();
