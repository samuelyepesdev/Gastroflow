/**
 * Voz del asistente como mejora progresiva: si el navegador no soporta reconocimiento o síntesis,
 * el botón correspondiente simplemente no aparece y el chat de texto sigue igual.
 * El audio lo procesa el propio navegador; el servidor solo recibe el texto reconocido.
 */
(function () {
    const IDIOMA = 'es-CO';
    const LLAVE_SALIDA = 'asistente:voz-salida';
    const $ = id => document.getElementById(id);
    if (!window.Asistente) {
        return;
    }

    function leerPreferencia() {
        try {
            return window.localStorage.getItem(LLAVE_SALIDA) === '1';
        } catch (e) {
            return false;
        }
    }

    function guardarPreferencia(activa) {
        try {
            window.localStorage.setItem(LLAVE_SALIDA, activa ? '1' : '0');
        } catch (e) {
            /* sin almacenamiento: la preferencia dura solo esta página */
        }
    }

    // ---------- Entrada: dictar ----------
    const Reconocimiento = window.SpeechRecognition || window.webkitSpeechRecognition;
    const botonMic = $('asistente-voz-entrada');
    if (Reconocimiento && botonMic) {
        botonMic.hidden = false;
        let activo = null;

        const terminar = () => {
            botonMic.classList.remove('activo');
            botonMic.setAttribute('aria-label', 'Dictar por voz');
            activo = null;
        };

        botonMic.addEventListener('click', () => {
            if (activo) {
                activo.stop();
                return;
            }
            const rec = new Reconocimiento();
            rec.lang = IDIOMA;
            rec.interimResults = false;
            rec.maxAlternatives = 1;
            rec.onresult = e => {
                const texto = e.results && e.results[0] && e.results[0][0] ? e.results[0][0].transcript : '';
                window.Asistente.enviarTexto(texto);
            };
            rec.onend = terminar;
            rec.onerror = terminar;
            activo = rec;
            botonMic.classList.add('activo');
            botonMic.setAttribute('aria-label', 'Dejar de escuchar');
            rec.start();
        });
    }

    // ---------- Salida: leer las respuestas ----------
    const sintesis = window.speechSynthesis;
    const botonAltavoz = $('asistente-voz-salida');
    if (sintesis && window.SpeechSynthesisUtterance && botonAltavoz) {
        botonAltavoz.hidden = false;
        let encendida = leerPreferencia();

        const pintar = () => {
            botonAltavoz.setAttribute('aria-pressed', String(encendida));
            botonAltavoz.classList.toggle('activo', encendida);
            botonAltavoz.firstElementChild.className = encendida ? 'bi bi-volume-up-fill' : 'bi bi-volume-mute';
        };
        pintar();

        botonAltavoz.addEventListener('click', () => {
            encendida = !encendida;
            guardarPreferencia(encendida);
            if (!encendida) {
                sintesis.cancel();
            }
            pintar();
        });

        window.Asistente.alResponder(texto => {
            if (!encendida || !texto) {
                return;
            }
            sintesis.cancel();
            const voz = new window.SpeechSynthesisUtterance(texto);
            voz.lang = IDIOMA;
            sintesis.speak(voz);
        });
    }
})();
