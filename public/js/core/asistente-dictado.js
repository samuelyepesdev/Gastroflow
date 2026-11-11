/**
 * Dictado del asistente. Camino principal: grabar con MediaRecorder y transcribir en el servidor
 * (Whisper), que funciona en cualquier navegador. Respaldo: el reconocimiento de voz del propio
 * navegador, solo si no se puede grabar (en Brave el reconocimiento integrado siempre falla).
 * El texto transcrito se envía como un comando normal, con todos sus controles.
 */
(function () {
    const IDIOMA = 'es-CO';
    const MAX_GRABACION_MS = 20000;
    const BITS_POR_SEGUNDO = 32000;
    const TIPOS_GRABACION = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
    const MSG_PERMISO = 'El navegador no me dejó usar el micrófono. Permítelo en el candado de la barra de direcciones.';
    const MSG_NO_ESCUCHE = 'No te escuché. Pulsa el micrófono y habla de nuevo.';
    const ERRORES_GRABACION = {
        NotAllowedError: MSG_PERMISO,
        SecurityError: MSG_PERMISO,
        NotFoundError: 'No encuentro un micrófono conectado.',
        NotReadableError: 'No puedo usar el micrófono: otra aplicación lo está ocupando.'
    };
    const ERRORES_RECONOCIMIENTO = {
        'not-allowed': MSG_PERMISO,
        'service-not-allowed': 'Este navegador no permite dictar por voz. Escribe tu pedido.',
        'audio-capture': 'No encuentro un micrófono conectado.',
        'no-speech': MSG_NO_ESCUCHE,
        network: 'No pude procesar la voz por la conexión del navegador. Inténtalo de nuevo o escribe tu pedido.',
        'language-not-supported': 'Este navegador no reconoce voz en español. Escribe tu pedido.'
    };

    const boton = document.getElementById('asistente-voz-entrada');
    if (!boton || !window.Asistente) {
        return;
    }
    const panel = window.Asistente;
    const puedeGrabar = !!(window.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const Reconocimiento = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!puedeGrabar && !Reconocimiento) {
        return;
    }
    boton.hidden = false;

    function pintar(escuchando) {
        if (escuchando) {
            boton.classList.add('activo');
            boton.setAttribute('aria-label', 'Dejar de escuchar');
        } else {
            boton.classList.remove('activo');
            boton.setAttribute('aria-label', 'Dictar por voz');
        }
    }

    // ---------- Principal: grabar y transcribir en el servidor ----------
    let grabadora = null;
    let transcribiendo = false;

    function tipoSoportado() {
        return TIPOS_GRABACION.find(t => window.MediaRecorder.isTypeSupported(t)) || '';
    }

    async function transcribir(blob) {
        transcribiendo = true;
        const nota = panel.nota('Transcribiendo…');
        const r = await window.AsistenteApi.transcribir(blob);
        nota.remove();
        transcribiendo = false;
        if (r.tipo !== 'transcripcion') {
            panel.avisar(r.texto);
        } else if (r.texto) {
            panel.enviarTexto(r.texto);
        } else {
            panel.avisar(MSG_NO_ESCUCHE);
        }
    }

    async function empezarGrabacion() {
        let flujo;
        try {
            flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
            pintar(false);
            panel.avisar(ERRORES_GRABACION[e && e.name] || 'No pude acceder al micrófono.');
            return;
        }
        const tipo = tipoSoportado();
        const trozos = [];
        const rec = new window.MediaRecorder(flujo, tipo ? { mimeType: tipo, audioBitsPerSecond: BITS_POR_SEGUNDO } : undefined);
        const nota = panel.nota('Escuchando… pulsa el micrófono cuando termines.');
        const limite = setTimeout(() => rec.state === 'recording' && rec.stop(), MAX_GRABACION_MS);

        rec.ondataavailable = e => e.data && e.data.size > 0 && trozos.push(e.data);
        rec.onstop = () => {
            clearTimeout(limite);
            flujo.getTracks().forEach(p => p.stop());
            nota.remove();
            grabadora = null;
            pintar(false);
            transcribir(new Blob(trozos, { type: rec.mimeType || tipo || 'audio/webm' }));
        };
        grabadora = rec;
        pintar(true);
        rec.start();
    }

    // ---------- Respaldo: reconocimiento del navegador ----------
    let reconocedor = null;

    function empezarReconocimiento() {
        const rec = new Reconocimiento();
        rec.lang = IDIOMA;
        rec.interimResults = false;
        rec.maxAlternatives = 1;
        rec.onresult = e => {
            const texto = e.results && e.results[0] && e.results[0][0] ? e.results[0][0].transcript.trim() : '';
            if (texto) {
                panel.enviarTexto(texto);
            }
        };
        rec.onend = () => {
            reconocedor = null;
            pintar(false);
        };
        rec.onerror = e => {
            reconocedor = null;
            pintar(false);
            // 'aborted' es detenerlo a mano: no es un fallo.
            const mensaje = ERRORES_RECONOCIMIENTO[e && e.error];
            if (mensaje) {
                panel.avisar(mensaje);
            }
        };
        reconocedor = rec;
        pintar(true);
        try {
            rec.start();
        } catch (err) {
            reconocedor = null;
            pintar(false);
            panel.avisar(ERRORES_RECONOCIMIENTO['service-not-allowed']);
        }
    }

    boton.addEventListener('click', () => {
        if (puedeGrabar) {
            if (grabadora) {
                grabadora.stop();
            } else if (!transcribiendo) {
                empezarGrabacion();
            }
        } else if (reconocedor) {
            reconocedor.stop();
        } else {
            empezarReconocimiento();
        }
    });
})();
