/**
 * facturacion.js - Registro del método de pago para el cobro automático de la
 * suscripción (página /facturacion).
 *
 * Flujo oficial de Wompi para "fuentes de pago" (pago recurrente). No usa el
 * Widget de Checkout, que es de pago único y no devuelve un payment_source
 * reutilizable:
 *   1. GET  {api}/merchants/{PUBLIC_KEY}
 *        -> presigned_acceptance.acceptance_token       (política de privacidad)
 *        -> presigned_personal_data_auth.acceptance_token (autorización de datos)
 *   2. POST {api}/tokens/cards  (Bearer PUBLIC_KEY)     -> token de tarjeta (tok_...)
 *   3. POST /facturacion/metodo-pago { cardToken, acceptanceToken, personalAuthToken }
 *        -> el backend lo cambia por un payment_source_id con la llave privada.
 *
 * WompiJs (window.$wompi, cargado en la vista desde
 * https://wompijs.wompi.com/libs/js/v1.js) aporta la huella de dispositivo
 * (sessionId / deviceID) para el scoring antifraude de Wompi.
 *
 * Los datos de tarjeta cruda solo viajan del navegador a Wompi (paso 2);
 * nunca pasan por este servidor.
 */
(function () {
    let cfg = {};
    try {
        const el = document.getElementById('facturacion-data');
        cfg = el ? JSON.parse(el.textContent) : {};
    } catch (e) {
        cfg = {};
    }

    // Huella de dispositivo de WompiJs (se rellena de forma asíncrona).
    const fingerprint = { sessionId: null, deviceId: null };
    function initWompiJs() {
        if (typeof window.$wompi === 'undefined' || typeof window.$wompi.initialize !== 'function') {
            return;
        }
        window.$wompi.initialize(function (data, error) {
            if (error === null && data) {
                fingerprint.sessionId = data.sessionId || null;
                fingerprint.deviceId = (data.deviceData && data.deviceData.deviceID) || null;
            }
        });
    }

    function mostrarFormularioTarjeta() {
        if (!cfg.wompiPublicKey || !cfg.wompiApiBase) {
            Swal.fire('No disponible', 'El cobro automático no está disponible en este momento.', 'error');
            return;
        }
        const cont = document.getElementById('wompiCardForm');
        if (cont) {
            cont.hidden = false;
            const num = document.getElementById('wompiCardNumber');
            if (num) num.focus();
        }
    }

    function setMensaje(texto, esError) {
        const el = document.getElementById('wompiCardMsg');
        if (!el) return;
        el.textContent = texto || '';
        el.classList.toggle('text-danger', Boolean(esError));
        el.classList.toggle('text-muted', !esError);
    }

    function parseExpiracion(valor) {
        const limpio = String(valor || '').replace(/\s/g, '');
        const m = limpio.match(/^(\d{2})\/(\d{2,4})$/);
        if (!m) return null;
        const mes = m[1];
        const anio = m[2].length === 4 ? m[2].slice(-2) : m[2];
        if (Number(mes) < 1 || Number(mes) > 12) return null;
        return { exp_month: mes, exp_year: anio };
    }

    async function obtenerTokensAceptacion() {
        const res = await fetch(`${cfg.wompiApiBase}/merchants/${cfg.wompiPublicKey}`);
        const json = await res.json().catch(() => ({}));
        const d = (json && json.data) || {};
        const acceptanceToken = d.presigned_acceptance && d.presigned_acceptance.acceptance_token;
        const personalAuthToken = d.presigned_personal_data_auth && d.presigned_personal_data_auth.acceptance_token;
        if (!res.ok || !acceptanceToken || !personalAuthToken) {
            throw new Error('No se pudieron obtener los tokens de aceptación de Wompi.');
        }
        return { acceptanceToken, personalAuthToken };
    }

    async function tokenizarTarjeta(datos) {
        const res = await fetch(`${cfg.wompiApiBase}/tokens/cards`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${cfg.wompiPublicKey}`
            },
            body: JSON.stringify(datos)
        });
        const json = await res.json().catch(() => ({}));
        const id = json && json.data && json.data.id;
        if (!res.ok || !id) {
            const msgs = json && json.error && json.error.messages;
            const detalle = msgs ? Object.values(msgs).flat().join(' ') : 'Revisa los datos de la tarjeta.';
            throw new Error(detalle);
        }
        return id;
    }

    async function guardarTarjeta() {
        const numero = (document.getElementById('wompiCardNumber') || {}).value || '';
        const cvc = (document.getElementById('wompiCardCvc') || {}).value || '';
        const exp = (document.getElementById('wompiCardExp') || {}).value || '';
        const titular = (document.getElementById('wompiCardHolder') || {}).value || '';
        const btn = document.getElementById('btnGuardarTarjeta');

        const expParsed = parseExpiracion(exp);
        if (!numero.replace(/\s/g, '') || !cvc || !expParsed || !titular.trim()) {
            setMensaje('Completa todos los campos (expiración en formato MM/AA).', true);
            return;
        }

        if (btn) btn.disabled = true;
        setMensaje('Procesando...', false);
        try {
            const { acceptanceToken, personalAuthToken } = await obtenerTokensAceptacion();
            const cardToken = await tokenizarTarjeta({
                number: numero.replace(/\s/g, ''),
                cvc: cvc.trim(),
                exp_month: expParsed.exp_month,
                exp_year: expParsed.exp_year,
                card_holder: titular.trim()
            });

            const res = await fetch('/facturacion/metodo-pago', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cardToken, acceptanceToken, personalAuthToken })
            });
            const data = await res.json().catch(() => ({}));
            if (data.ok) {
                Swal.fire('¡Listo!', 'Cobro automático activado.', 'success').then(() => location.reload());
            } else {
                setMensaje(data.error || 'No se pudo guardar el método de pago.', true);
                if (btn) btn.disabled = false;
            }
        } catch (err) {
            setMensaje(err.message || 'No se pudo guardar el método de pago.', true);
            if (btn) btn.disabled = false;
        }
    }

    function cobrarAhora() {
        Swal.fire({
            title: '¿Cobrar ahora?',
            text: 'Se intentará cobrar tu suscripción de inmediato.',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, cobrar'
        }).then(res => {
            if (!res.isConfirmed) {
                return;
            }
            fetch('/facturacion/cobrar-ahora', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: fingerprint.sessionId, deviceId: fingerprint.deviceId })
            })
                .then(r => r.json())
                .then(data => {
                    if (data.ok) {
                        Swal.fire('Cobro iniciado', data.mensaje || 'Te avisaremos por correo.', 'success');
                    } else {
                        Swal.fire('Error', data.error || 'No se pudo iniciar el cobro', 'error');
                    }
                })
                .catch(() => Swal.fire('Error', 'No se pudo iniciar el cobro', 'error'));
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        initWompiJs();
        const btnActivar = document.getElementById('btnActivarCobroAutomatico');
        const btnActualizar = document.getElementById('btnActualizarTarjeta');
        const btnGuardar = document.getElementById('btnGuardarTarjeta');
        const btnCobrar = document.getElementById('btnCobrarAhora');
        if (btnActivar) btnActivar.addEventListener('click', mostrarFormularioTarjeta);
        if (btnActualizar) btnActualizar.addEventListener('click', mostrarFormularioTarjeta);
        if (btnGuardar) btnGuardar.addEventListener('click', guardarTarjeta);
        if (btnCobrar) btnCobrar.addEventListener('click', cobrarAhora);
    });
})();
