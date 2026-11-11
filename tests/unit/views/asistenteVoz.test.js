/**
 * Voz de salida del asistente: se ejecuta el script real del navegador dentro de un contexto simulado
 * (sin navegador) para comprobar cómo habla, qué voz elige y que el botón da señal audible.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SCRIPT = fs.readFileSync(path.join(__dirname, '../../../public/js/core/asistente-voz.js'), 'utf8');

function elemento() {
    const oyentes = {};
    return {
        hidden: true,
        classList: { toggle: jest.fn(), add: jest.fn(), remove: jest.fn() },
        firstElementChild: { className: '' },
        setAttribute: jest.fn(),
        addEventListener: (tipo, fn) => (oyentes[tipo] = fn),
        click: () => oyentes.click && oyentes.click()
    };
}

function montar({ voces = [], almacenado = null, reconocimiento = false } = {}) {
    const dicho = [];
    const llamadas = [];
    const elementos = { 'asistente-voz-salida': elemento(), 'asistente-voz-entrada': elemento() };
    let responder = () => {};
    const reconocedores = [];
    function Reconocedor() {
        this.start = jest.fn();
        this.stop = jest.fn();
        reconocedores.push(this);
    }
    function Locucion(texto) {
        this.text = texto;
    }
    const contexto = {
        console,
        setTimeout,
        document: { getElementById: id => elementos[id] || null },
        window: {
            Asistente: { enviarTexto: jest.fn(), avisar: jest.fn(), alResponder: fn => (responder = fn) },
            ...(reconocimiento ? { SpeechRecognition: Reconocedor } : {}),
            SpeechSynthesisUtterance: Locucion,
            speechSynthesis: {
                speaking: false,
                paused: false,
                getVoices: () => voces,
                cancel: () => llamadas.push('cancel'),
                resume: () => llamadas.push('resume'),
                speak: u => {
                    llamadas.push('speak');
                    dicho.push(u);
                }
            },
            localStorage: { getItem: () => almacenado, setItem: jest.fn() }
        }
    };
    vm.runInNewContext(SCRIPT, contexto);
    return { elementos, dicho, llamadas, reconocedores, responder: t => responder(t), contexto };
}

describe('voz de salida del asistente', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('elige una voz en español, prefiriendo es-CO, y la usa con su idioma', () => {
        const voces = [
            { lang: 'en-US', name: 'Inglés' },
            { lang: 'es_ES', name: 'España' },
            { lang: 'es-CO', name: 'Colombia' },
            { lang: 'es-MX', name: 'México' }
        ];
        const { responder, dicho } = montar({ voces, almacenado: '1' });

        responder('Hay 3 mesas libres');
        jest.advanceTimersByTime(200);

        expect(dicho).toHaveLength(1);
        expect(dicho[0].voice.name).toBe('Colombia');
        expect(dicho[0].lang).toBe('es-CO');
    });

    it('si no hay es-CO usa otra voz en español; sin ninguna, pide es-CO y deja que el navegador decida', () => {
        const otra = montar({ voces: [{ lang: 'es-419', name: 'Latam' }], almacenado: '1' });
        otra.responder('hola');
        jest.advanceTimersByTime(200);
        expect(otra.dicho[0].voice.name).toBe('Latam');

        const ninguna = montar({ voces: [{ lang: 'en-US', name: 'Inglés' }], almacenado: '1' });
        ninguna.responder('hola');
        jest.advanceTimersByTime(200);
        expect(ninguna.dicho[0].voice).toBeUndefined();
        expect(ninguna.dicho[0].lang).toBe('es-CO');
    });

    it('no habla en el mismo instante que cancela: Chrome descartaría la locución', () => {
        const { responder, llamadas } = montar({ almacenado: '1' });

        responder('hola');
        expect(llamadas).not.toContain('speak');

        jest.advanceTimersByTime(200);
        expect(llamadas.indexOf('cancel')).toBeLessThan(llamadas.indexOf('speak'));
    });

    it('apagado no habla', () => {
        const { responder, llamadas } = montar({ almacenado: '0' });

        responder('hola');
        jest.advanceTimersByTime(200);

        expect(llamadas).not.toContain('speak');
    });

    it('al encender el botón confirma en voz alta, para que se oiga si funciona', () => {
        const { elementos, dicho } = montar({ almacenado: '0' });

        elementos['asistente-voz-salida'].click();
        jest.advanceTimersByTime(200);

        expect(dicho.map(d => d.text)).toEqual(['Voz activada']);
    });

    it('al apagarlo cancela lo que estuviera hablando y no dice nada', () => {
        const { elementos, dicho, llamadas } = montar({ almacenado: '1' });

        elementos['asistente-voz-salida'].click();
        jest.advanceTimersByTime(200);

        expect(llamadas).toContain('cancel');
        expect(dicho).toHaveLength(0);
    });
});

describe('dictado por voz del asistente', () => {
    const pulsarMic = montado => {
        montado.elementos['asistente-voz-entrada'].click();
        return montado.reconocedores[montado.reconocedores.length - 1];
    };

    it('muestra el micrófono solo si el navegador sabe reconocer voz', () => {
        expect(montar().elementos['asistente-voz-entrada'].hidden).toBe(true);
        expect(montar({ reconocimiento: true }).elementos['asistente-voz-entrada'].hidden).toBe(false);
    });

    it('escucha en español de Colombia y envía lo dictado como comando', () => {
        const m = montar({ reconocimiento: true });
        const rec = pulsarMic(m);

        expect(rec.lang).toBe('es-CO');
        expect(rec.start).toHaveBeenCalled();
        rec.onresult({ results: [[{ transcript: '4 ramen para la mesa 8' }]] });

        expect(m.contexto.window.Asistente.enviarTexto).toHaveBeenCalledWith('4 ramen para la mesa 8');
    });

    it.each([
        ['not-allowed', /permiso|micr[oó]fono/i],
        ['service-not-allowed', /permiso|micr[oó]fono|navegador/i],
        ['audio-capture', /micr[oó]fono/i],
        ['no-speech', /no te escuch/i],
        ['network', /conexi[oó]n|navegador/i],
        ['language-not-supported', /idioma|navegador/i]
    ])('si el dictado falla (%s) lo dice en el chat en vez de callar', (codigo, esperado) => {
        const m = montar({ reconocimiento: true });
        const rec = pulsarMic(m);

        rec.onerror({ error: codigo });

        expect(m.contexto.window.Asistente.avisar).toHaveBeenCalledTimes(1);
        expect(m.contexto.window.Asistente.avisar.mock.calls[0][0]).toMatch(esperado);
    });

    it('detenerlo a mano (aborted) no es un error y no avisa', () => {
        const m = montar({ reconocimiento: true });
        const rec = pulsarMic(m);

        rec.onerror({ error: 'aborted' });

        expect(m.contexto.window.Asistente.avisar).not.toHaveBeenCalled();
    });

    it('un dictado vacío no envía nada', () => {
        const m = montar({ reconocimiento: true });
        const rec = pulsarMic(m);

        rec.onresult({ results: [[{ transcript: '   ' }]] });

        expect(m.contexto.window.Asistente.enviarTexto).not.toHaveBeenCalled();
    });
});
