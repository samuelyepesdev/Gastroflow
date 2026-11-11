const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SCRIPT = fs.readFileSync(path.join(__dirname, '../../../public/js/core/asistente-api.js'), 'utf8');

function montar(respuesta) {
    const fetch = jest.fn().mockResolvedValue(respuesta);
    const contexto = { console, Date, Math, Blob, fetch, window: { crypto: { randomUUID: () => 'llave-1' } } };
    vm.runInNewContext(SCRIPT, contexto);
    return { api: contexto.window.AsistenteApi, fetch };
}

const resp = (estado, cuerpo) => ({ status: estado, json: async () => cuerpo });

describe('cliente HTTP del asistente / transcribir', () => {
    it('envía el audio crudo con su tipo y devuelve la transcripción', async () => {
        const { api, fetch } = montar(resp(200, { tipo: 'transcripcion', texto: 'hola' }));
        const blob = new Blob(['x'], { type: 'audio/webm;codecs=opus' });

        const r = await api.transcribir(blob);

        const [url, opciones] = fetch.mock.calls[0];
        expect(url).toBe('/api/asistente/transcribir');
        expect(opciones.method).toBe('POST');
        expect(opciones.body).toBe(blob);
        expect(opciones.headers['Content-Type']).toBe('audio/webm;codecs=opus');
        expect(opciones.headers['Idempotency-Key']).toBe('llave-1');
        expect(r).toEqual({ tipo: 'transcripcion', texto: 'hola' });
    });

    it('un audio demasiado grande (413, sin JSON) se explica en lenguaje claro', async () => {
        const { api } = montar({ status: 413, json: async () => Promise.reject(new SyntaxError('html')) });

        const r = await api.transcribir(new Blob(['x'], { type: 'audio/webm' }));

        expect(r.tipo).toBe('error');
        expect(r.texto).toMatch(/largo|grande/i);
    });

    it('sigue enviando los comandos como JSON', async () => {
        const { api, fetch } = montar(resp(200, { tipo: 'respuesta', texto: 'ok' }));

        await api.comando('hola', []);

        const [, opciones] = fetch.mock.calls[0];
        expect(opciones.headers['Content-Type']).toBe('application/json');
        expect(JSON.parse(opciones.body)).toEqual({ texto: 'hola', historial: [] });
    });
});
