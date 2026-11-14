/**
 * GF.tiempoReal.saludable(): las pantallas omiten su polling de respaldo solo si el SSE está vivo.
 * gf.js es un IIFE de navegador: se carga con un `window` y un EventSource simulados.
 */
class FakeEventSource {
    static OPEN = 1;
    static CLOSED = 2;
    constructor(url) {
        this.url = url;
        this.readyState = FakeEventSource.OPEN;
        this.listeners = {};
        FakeEventSource.ultimo = this;
    }
    addEventListener(tipo, fn) {
        (this.listeners[tipo] = this.listeners[tipo] || []).push(fn);
    }
    emitir(data) {
        (this.listeners.message || []).forEach(fn => fn({ data: JSON.stringify(data) }));
    }
    close() {
        this.readyState = FakeEventSource.CLOSED;
    }
}

describe('GF.tiempoReal.saludable', () => {
    let GF;
    let ahora;

    beforeEach(() => {
        jest.resetModules();
        ahora = 1_000_000;
        jest.spyOn(Date, 'now').mockImplementation(() => ahora);
        global.EventSource = FakeEventSource; // en el navegador es un global; window.EventSource es el mismo
        global.window = { EventSource: FakeEventSource, addEventListener: jest.fn() };
        global.document = { addEventListener: jest.fn() };
        require('../../../public/js/core/gf.js');
        GF = global.window.GF;
    });

    afterEach(() => {
        jest.restoreAllMocks();
        delete global.window;
        delete global.EventSource;
        delete global.document;
    });

    test('antes de suscribirse (sin conexión) no es saludable: el respaldo sigue activo', () => {
        expect(GF.tiempoReal.saludable()).toBe(false);
    });

    test('conectado y con mensajes recientes es saludable', () => {
        GF.tiempoReal.on('connected', () => {});
        FakeEventSource.ultimo.emitir({ event: 'connected' });
        expect(GF.tiempoReal.saludable()).toBe(true);
    });

    test('abierta pero sin ningún mensaje (ni latido) en 75 s deja de ser saludable', () => {
        GF.tiempoReal.on('connected', () => {});
        FakeEventSource.ultimo.emitir({ event: 'connected' });
        ahora += 74_000;
        expect(GF.tiempoReal.saludable()).toBe(true);
        ahora += 2_000;
        expect(GF.tiempoReal.saludable()).toBe(false);
    });

    test('un latido (ping) renueva la salud', () => {
        GF.tiempoReal.on('connected', () => {});
        FakeEventSource.ultimo.emitir({ event: 'connected' });
        ahora += 60_000;
        FakeEventSource.ultimo.emitir({ event: 'ping' });
        ahora += 60_000;
        expect(GF.tiempoReal.saludable()).toBe(true);
    });

    test('conexión cerrada por el navegador no es saludable aunque hubo mensajes', () => {
        GF.tiempoReal.on('connected', () => {});
        FakeEventSource.ultimo.emitir({ event: 'connected' });
        FakeEventSource.ultimo.readyState = FakeEventSource.CLOSED;
        expect(GF.tiempoReal.saludable()).toBe(false);
    });

    test('el ping llega a los handlers del evento (sin romper a los demás)', () => {
        const orden = jest.fn();
        GF.tiempoReal.on('orderCreated', orden);
        FakeEventSource.ultimo.emitir({ event: 'ping' });
        expect(orden).not.toHaveBeenCalled();
        FakeEventSource.ultimo.emitir({ event: 'orderCreated', pedidoId: 3 });
        expect(orden).toHaveBeenCalledTimes(1);
    });
});
