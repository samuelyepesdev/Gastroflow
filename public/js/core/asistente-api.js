/**
 * Cliente HTTP del asistente. Solo habla con /api/asistente; no toca el DOM.
 * Devuelve siempre un objeto { tipo, texto, ... }: los errores del servidor y de red también,
 * para que el panel los pinte igual que cualquier respuesta.
 */
(function () {
    const BASE = '/api/asistente';
    const MENSAJES = {
        limite: 'Vas muy rápido. Espera un momento e inténtalo de nuevo.',
        red: 'No pude conectar con el asistente. Revisa tu conexión e inténtalo de nuevo.'
    };

    function llaveIdempotencia() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID();
        }
        return 'gf-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    }

    async function enviar(ruta, cuerpo) {
        try {
            const resp = await fetch(BASE + ruta, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'Idempotency-Key': llaveIdempotencia()
                },
                body: JSON.stringify(cuerpo)
            });
            const datos = await resp.json().catch(() => null);
            if (datos && datos.tipo) {
                return datos;
            }
            if (resp.status === 429) {
                return { tipo: 'error', codigo: 'limite', texto: MENSAJES.limite };
            }
            const texto = (datos && (datos.error || datos.texto)) || MENSAJES.red;
            return { tipo: 'error', codigo: 'http_' + resp.status, texto };
        } catch (e) {
            return { tipo: 'error', codigo: 'red', texto: MENSAJES.red };
        }
    }

    async function nombre() {
        try {
            const resp = await fetch(BASE + '/estado', {
                credentials: 'same-origin',
                headers: { Accept: 'application/json' }
            });
            const datos = await resp.json();
            return typeof datos.nombre === 'string' && datos.nombre ? datos.nombre : 'Chef';
        } catch (e) {
            return 'Chef';
        }
    }

    window.AsistenteApi = {
        nombre,
        comando: (texto, historial) => enviar('/comando', { texto, historial }),
        confirmar: (confirmationId, aceptar) => enviar('/confirmar', { confirmationId, aceptar })
    };
})();
