/**
 * Voz de salida del asistente (leer las respuestas) como mejora progresiva: si el navegador no soporta reconocimiento o síntesis,
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

    // ---------- Salida: leer las respuestas ----------
    const sintesis = window.speechSynthesis;
    const botonAltavoz = $('asistente-voz-salida');
    if (sintesis && window.SpeechSynthesisUtterance && botonAltavoz) {
        botonAltavoz.hidden = false;
        let encendida = leerPreferencia();
        // Referencia viva: algunos navegadores recogen la locución antes de que termine y se queda muda.
        let enCurso = null;

        const normalizar = lang => String(lang || '').toLowerCase().replace('_', '-');

        /** Una voz en español: es-CO si existe, luego otras variantes latinas, luego cualquiera. */
        function elegirVoz() {
            const espanol = sintesis.getVoices().filter(v => normalizar(v.lang).startsWith('es'));
            for (const idioma of [IDIOMA, 'es-419', 'es-mx', 'es-us', 'es-es']) {
                const voz = espanol.find(v => normalizar(v.lang) === normalizar(idioma));
                if (voz) {
                    return voz;
                }
            }
            return espanol[0] || null;
        }

        function hablar(texto) {
            // cancel() y speak() en el mismo instante hacen que Chrome descarte la locución.
            sintesis.cancel();
            const locucion = new window.SpeechSynthesisUtterance(texto);
            const voz = elegirVoz();
            if (voz) {
                locucion.voice = voz;
            }
            locucion.lang = voz ? voz.lang : IDIOMA;
            const liberar = () => {
                if (enCurso === locucion) {
                    enCurso = null;
                }
            };
            locucion.onend = liberar;
            locucion.onerror = liberar;
            enCurso = locucion;
            setTimeout(() => {
                if (sintesis.paused) {
                    sintesis.resume();
                }
                sintesis.speak(locucion);
            }, 60);
        }

        const pintar = () => {
            botonAltavoz.setAttribute('aria-pressed', String(encendida));
            botonAltavoz.classList.toggle('activo', encendida);
            botonAltavoz.firstElementChild.className = encendida ? 'bi bi-volume-up-fill' : 'bi bi-volume-mute';
        };
        pintar();

        botonAltavoz.addEventListener('click', () => {
            encendida = !encendida;
            guardarPreferencia(encendida);
            pintar();
            if (encendida) {
                // Al hablar dentro del clic, el navegador permite hablar después; además se oye si funciona.
                hablar('Voz activada');
            } else {
                sintesis.cancel();
            }
        });

        window.Asistente.alResponder(texto => {
            if (encendida && texto) {
                hablar(texto);
            }
        });
    }
})();
