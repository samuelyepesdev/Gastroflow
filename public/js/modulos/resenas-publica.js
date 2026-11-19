/**
 * resenas-publica.js — Página pública de opiniones (sin login, acotada por token).
 * Elegir estrellas abre el detalle: con 3 o menos se invita a contar qué pasó y a dejar contacto;
 * con 4 o 5 solo se pide un comentario opcional. El enlace a Google se ve para todos al terminar.
 */
(function () {
    'use strict';

    const CFG = window.RESENA_PUBLICA || {};
    const UMBRAL_BAJA = 3;
    const LEYENDAS = { 1: 'Muy mala', 2: 'Mala', 3: 'Regular', 4: 'Buena', 5: 'Excelente' };

    const $ = id => document.getElementById(id);
    const estrellas = Array.from(document.querySelectorAll('.rs-estrella'));
    const form = $('rsForm');
    let calificacion = 0;

    function elegir(valor) {
        calificacion = valor;
        estrellas.forEach(btn => {
            const n = Number(btn.dataset.valor);
            btn.classList.toggle('activa', n <= valor);
            btn.setAttribute('aria-checked', n === valor ? 'true' : 'false');
        });
        $('rsLeyenda').textContent = LEYENDAS[valor];

        const baja = valor <= UMBRAL_BAJA;
        $('rsDetalleTitulo').textContent = baja
            ? 'Lamentamos que no haya sido perfecto. Cuéntanos qué pasó para poder mejorarlo.'
            : '¡Nos alegra! Si quieres, cuéntanos qué fue lo que más te gustó.';
        $('rsContacto').classList.toggle('d-none', !baja);
        form.classList.remove('d-none');
    }

    estrellas.forEach(btn => btn.addEventListener('click', () => elegir(Number(btn.dataset.valor))));

    // El cliente solo debe aceptar el tratamiento de datos cuando escribe un celular.
    $('rsTelefono').addEventListener('input', () => {
        $('rsConsentWrap').classList.toggle('d-none', !$('rsTelefono').value.trim());
    });

    function mostrarError(mensaje) {
        const caja = $('rsError');
        caja.textContent = mensaje;
        caja.classList.remove('d-none');
    }

    form.addEventListener('submit', async evento => {
        evento.preventDefault();
        $('rsError').classList.add('d-none');
        if (!calificacion) {
            mostrarError('Elige de 1 a 5 estrellas.');
            return;
        }
        const boton = $('rsEnviar');
        boton.disabled = true;
        try {
            const resp = await fetch(`/resena/${encodeURIComponent(CFG.token)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    calificacion,
                    comentario: $('rsComentario').value.trim(),
                    nombre: $('rsNombre').value.trim(),
                    telefono: $('rsTelefono').value.trim(),
                    consentimiento: $('rsConsent').checked,
                    web: form.elements.web.value
                })
            });
            const json = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                throw new Error(json.error || json.message || 'No se pudo enviar tu opinión. Intenta de nuevo.');
            }
            $('rsFormulario').classList.add('d-none');
            const gracias = $('rsGracias');
            gracias.classList.remove('d-none');
            gracias.focus();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (error) {
            mostrarError(error.message);
        } finally {
            boton.disabled = false;
        }
    });
})();
