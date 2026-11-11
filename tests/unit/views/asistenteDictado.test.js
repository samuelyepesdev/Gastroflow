/**
 * Dictado del asistente: se ejecuta el script real del navegador en un contexto simulado.
 * Camino principal: grabar con MediaRecorder y transcribir en el servidor (funciona en Brave, Firefox,
 * Safari y móviles). Respaldo: el reconocimiento de voz del propio navegador.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SCRIPT = fs.readFileSync(path.join(__dirname, '../../../public/js/core/asistente-dictado.js'), 'utf8');
const asentar = async () => {
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
};

function elemento() {
    const oyentes = {};
    return {
        hidden: true,
        classList: { add: jest.fn(), remove: jest.fn() },
        setAttribute: jest.fn(),
        addEventListener: (tipo, fn) => (oyentes[tipo] = fn),
        click: () => oyentes.click && oyentes.click()
    };
}

/** Navegador simulado. `soportados` = tipos que MediaRecorder dice poder grabar. */
function montar({ grabadora = true, reconocimiento = false, soportados = ['audio/webm;codecs=opus'], permiso } = {}) {
    const boton = elemento();
    const pista = { stop: jest.fn() };
    const flujo = { getTracks: () => [pista] };
    const grabaciones = [];
    const reconocedores = [];
    const notas = [];

    function Grabadora(flujoRecibido, opciones) {
        this.flujo = flujoRecibido;
        this.opciones = opciones;
        this.mimeType = (opciones && opciones.mimeType) || '';
        this.state = 'inactive';
        this.start = jest.fn(() => {
            this.state = 'recording';
        });
        this.stop = jest.fn(() => {
            this.state = 'inactive';
            this.ondataavailable({ data: new Blob([Buffer.alloc(4000)]) });
            this.onstop();
        });
        grabaciones.push(this);
    }
    Grabadora.isTypeSupported = tipo => soportados.includes(tipo);

    function Reconocedor() {
        this.start = jest.fn();
        this.stop = jest.fn();
        reconocedores.push(this);
    }

    const Asistente = {
        enviarTexto: jest.fn(),
        avisar: jest.fn(),
        nota: jest.fn(() => {
            const n = { remove: jest.fn() };
            notas.push(n);
            return n;
        })
    };
    const AsistenteApi = { transcribir: jest.fn().mockResolvedValue({ tipo: 'transcripcion', texto: 'cuatro ramen' }) };
    const getUserMedia = jest.fn(() => (permiso ? Promise.reject(permiso) : Promise.resolve(flujo)));

    const contexto = {
        console,
        setTimeout,
        clearTimeout,
        Blob,
        document: { getElementById: id => (id === 'asistente-voz-entrada' ? boton : null) },
        navigator: { mediaDevices: { getUserMedia } },
        window: {
            Asistente,
            AsistenteApi,
            ...(grabadora ? { MediaRecorder: Grabadora } : {}),
            ...(reconocimiento ? { SpeechRecognition: Reconocedor } : {})
        }
    };
    contexto.window.navigator = contexto.navigator;
    vm.runInNewContext(SCRIPT, contexto);
    return { boton, pista, grabaciones, reconocedores, notas, Asistente, AsistenteApi, getUserMedia };
}

describe('dictado por voz del asistente', () => {
    afterEach(() => jest.useRealTimers());

    describe('sin ningún método de voz', () => {
        it('no muestra el micrófono', () => {
            expect(montar({ grabadora: false }).boton.hidden).toBe(true);
        });
    });

    describe('grabando y transcribiendo en el servidor', () => {
        it('muestra el micrófono, pide acceso al audio y empieza a grabar al pulsarlo', async () => {
            const m = montar();
            expect(m.boton.hidden).toBe(false);

            m.boton.click();
            await asentar();

            expect(m.getUserMedia).toHaveBeenCalledWith({ audio: true });
            expect(m.grabaciones).toHaveLength(1);
            expect(m.grabaciones[0].start).toHaveBeenCalled();
            expect(m.boton.classList.add).toHaveBeenCalledWith('activo');
        });

        it('al pulsarlo otra vez detiene, suelta el micrófono, transcribe y envía el texto como comando', async () => {
            const m = montar();
            m.boton.click();
            await asentar();

            m.boton.click();
            await asentar();

            expect(m.grabaciones[0].stop).toHaveBeenCalled();
            expect(m.pista.stop).toHaveBeenCalled();
            expect(m.AsistenteApi.transcribir).toHaveBeenCalledTimes(1);
            const blob = m.AsistenteApi.transcribir.mock.calls[0][0];
            expect(blob.size).toBe(4000);
            expect(blob.type).toBe('audio/webm;codecs=opus');
            expect(m.Asistente.enviarTexto).toHaveBeenCalledWith('cuatro ramen');
        });

        it('graba en el formato que el navegador soporte: webm/opus, o mp4 en Safari', async () => {
            const chrome = montar({ soportados: ['audio/webm;codecs=opus', 'audio/webm'] });
            chrome.boton.click();
            await asentar();
            expect(chrome.grabaciones[0].opciones.mimeType).toBe('audio/webm;codecs=opus');

            const safari = montar({ soportados: ['audio/mp4'] });
            safari.boton.click();
            await asentar();
            expect(safari.grabaciones[0].opciones.mimeType).toBe('audio/mp4');
        });

        it('se detiene solo a los 20 segundos', async () => {
            jest.useFakeTimers();
            const m = montar();
            m.boton.click();
            await asentar();

            await jest.advanceTimersByTimeAsync(20000);

            expect(m.grabaciones[0].stop).toHaveBeenCalled();
            expect(m.AsistenteApi.transcribir).toHaveBeenCalled();
        });

        it('si no se entendió nada (texto vacío) lo dice y no envía nada', async () => {
            const m = montar();
            m.AsistenteApi.transcribir.mockResolvedValue({ tipo: 'transcripcion', texto: '' });
            m.boton.click();
            await asentar();
            m.boton.click();
            await asentar();

            expect(m.Asistente.enviarTexto).not.toHaveBeenCalled();
            expect(m.Asistente.avisar.mock.calls[0][0]).toMatch(/no te escuch/i);
        });

        it('si el servidor responde con un error lo muestra y no envía nada', async () => {
            const m = montar();
            m.AsistenteApi.transcribir.mockResolvedValue({
                tipo: 'error',
                codigo: 'proveedor',
                texto: 'Servicio caído.'
            });
            m.boton.click();
            await asentar();
            m.boton.click();
            await asentar();

            expect(m.Asistente.avisar).toHaveBeenCalledWith('Servicio caído.');
            expect(m.Asistente.enviarTexto).not.toHaveBeenCalled();
        });

        it('quita los avisos de "escuchando" y "transcribiendo" al terminar', async () => {
            const m = montar();
            m.boton.click();
            await asentar();
            m.boton.click();
            await asentar();

            expect(m.notas.length).toBeGreaterThanOrEqual(2);
            m.notas.forEach(n => expect(n.remove).toHaveBeenCalled());
        });

        it.each([
            ['NotAllowedError', /permit|micr[oó]fono/i],
            ['SecurityError', /permit|micr[oó]fono/i],
            ['NotFoundError', /micr[oó]fono conectado|encuentro/i],
            ['AbortError', /micr[oó]fono/i]
        ])('si getUserMedia falla (%s) lo explica y no graba', async (nombre, esperado) => {
            const m = montar({ permiso: Object.assign(new Error('x'), { name: nombre }) });

            m.boton.click();
            await asentar();

            expect(m.grabaciones).toHaveLength(0);
            expect(m.Asistente.avisar.mock.calls[0][0]).toMatch(esperado);
            expect(m.boton.classList.remove).toHaveBeenCalledWith('activo');
        });

        it('un segundo clic mientras se transcribe no inicia otra grabación', async () => {
            const m = montar();
            let terminar;
            m.AsistenteApi.transcribir.mockReturnValue(new Promise(r => (terminar = r)));
            m.boton.click();
            await asentar();
            m.boton.click();
            await asentar();

            m.boton.click();
            await asentar();
            expect(m.grabaciones).toHaveLength(1);

            terminar({ tipo: 'transcripcion', texto: 'hola' });
            await asentar();
        });
    });

    describe('respaldo: reconocimiento de voz del navegador', () => {
        const pulsar = m => {
            m.boton.click();
            return m.reconocedores[m.reconocedores.length - 1];
        };

        it('si no se puede grabar pero sí reconocer, usa el reconocimiento del navegador en es-CO', () => {
            const m = montar({ grabadora: false, reconocimiento: true });
            expect(m.boton.hidden).toBe(false);

            const rec = pulsar(m);
            expect(rec.lang).toBe('es-CO');
            rec.onresult({ results: [[{ transcript: '4 ramen para la mesa 8' }]] });

            expect(m.Asistente.enviarTexto).toHaveBeenCalledWith('4 ramen para la mesa 8');
            expect(m.AsistenteApi.transcribir).not.toHaveBeenCalled();
        });

        it('si puede grabar, el reconocimiento del navegador no se usa (en Brave siempre fallaba)', async () => {
            const m = montar({ grabadora: true, reconocimiento: true });

            m.boton.click();
            await asentar();

            expect(m.reconocedores).toHaveLength(0);
            expect(m.grabaciones).toHaveLength(1);
        });

        it.each([
            ['not-allowed', /permiso|micr[oó]fono/i],
            ['no-speech', /no te escuch/i],
            ['network', /conexi[oó]n|navegador/i]
        ])('sus errores (%s) se explican en el chat', (codigo, esperado) => {
            const m = montar({ grabadora: false, reconocimiento: true });
            pulsar(m).onerror({ error: codigo });

            expect(m.Asistente.avisar.mock.calls[0][0]).toMatch(esperado);
        });

        it('detenerlo a mano (aborted) no avisa y un dictado vacío no envía nada', () => {
            const m = montar({ grabadora: false, reconocimiento: true });
            const rec = pulsar(m);

            rec.onerror({ error: 'aborted' });
            rec.onresult({ results: [[{ transcript: '   ' }]] });

            expect(m.Asistente.avisar).not.toHaveBeenCalled();
            expect(m.Asistente.enviarTexto).not.toHaveBeenCalled();
        });
    });
});
