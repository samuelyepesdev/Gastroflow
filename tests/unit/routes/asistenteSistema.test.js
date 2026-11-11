// Los límites se leen del entorno al cargar el router: fijarlos ANTES de requerirlo.
process.env.ASISTENTE_LIMITE_SISTEMA_MIN = '2';
process.env.ASISTENTE_LIMITE_SISTEMA_VOZ_MIN = '2';

const express = require('express');
const request = require('supertest');

jest.mock('../../../services/Admin/AsistenteAdminService', () => ({
    resumen: jest.fn(),
    usuarios: jest.fn(),
    activarAddon: jest.fn(),
    renombrar: jest.fn(),
    fijarAcceso: jest.fn()
}));
jest.mock('../../../services/Admin/AsistenteSistema/AsistenteSistemaService', () => ({ comando: jest.fn() }));
jest.mock('../../../services/Tenant/Asistente/llm', () => ({
    asistenteConfigurado: jest.fn(() => true),
    crearTranscriptor: jest.fn()
}));
jest.mock('../../../services/Admin/TenantAuditService', () => ({ log: jest.fn() }));

const AsistenteSistemaService = require('../../../services/Admin/AsistenteSistema/AsistenteSistemaService');
const TenantAuditService = require('../../../services/Admin/TenantAuditService');
const { asistenteConfigurado, crearTranscriptor } = require('../../../services/Tenant/Asistente/llm');
const { LlmError } = require('../../../services/Tenant/Asistente/llm/errores');
const router = require('../../../routes/admin/asistente');

let contador = 9000;
function crearApp(userId = (contador += 1)) {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
        // Como en producción: el superadmin NO tiene restaurante (no hay req.tenant).
        req.user = { id: userId, rol: 'superadmin' };
        next();
    });
    app.use('/admin/asistente', router);
    return app;
}

const BASE = '/admin/asistente/api/chat';
const audio = (bytes = 3000) => Buffer.alloc(bytes, 1);
const dictar = (app, cuerpo = audio(), tipo = 'audio/webm') =>
    request(app).post(`${BASE}/transcribir`).set('Content-Type', tipo).send(cuerpo);

describe('asistente del sistema / rutas', () => {
    let errorSpy;

    beforeEach(() => {
        jest.resetAllMocks();
        errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        asistenteConfigurado.mockReturnValue(true);
        TenantAuditService.log.mockResolvedValue();
    });

    afterEach(() => errorSpy.mockRestore());

    describe('GET /estado', () => {
        it('devuelve el nombre del asistente del sistema', async () => {
            const res = await request(crearApp()).get(`${BASE}/estado`);

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ nombre: 'Asistente del sistema' });
        });
    });

    describe('POST /comando', () => {
        it('responde con lo que devuelve el servicio y toma al superadmin SOLO de la sesión', async () => {
            AsistenteSistemaService.comando.mockResolvedValue({
                tipo: 'respuesta',
                texto: 'Hay 3 restaurantes.',
                meta: { herramientas: [{ nombre: 'resumen_plataforma', resultado: 'resultado' }], uso: { total: 42 } }
            });
            const app = crearApp(77);

            const res = await request(app)
                .post(`${BASE}/comando`)
                .send({ texto: 'resumen', historial: [], userId: 999, tenantId: 5 });

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ tipo: 'respuesta', texto: 'Hay 3 restaurantes.' });
            expect(AsistenteSistemaService.comando).toHaveBeenCalledWith(
                { userId: 77 },
                { texto: 'resumen', historial: [] }
            );
        });

        it('deja auditoría sin restaurante: quién, qué preguntó, herramientas y tokens', async () => {
            AsistenteSistemaService.comando.mockResolvedValue({
                tipo: 'respuesta',
                texto: 'ok',
                meta: { herramientas: [{ nombre: 'cola_trabajos', resultado: 'resultado' }], uso: { total: 42 } }
            });

            await request(crearApp(77)).post(`${BASE}/comando`).send({ texto: 'cómo va la cola' });

            expect(TenantAuditService.log).toHaveBeenCalledTimes(1);
            const registro = TenantAuditService.log.mock.calls[0][0];
            expect(registro).toMatchObject({ tenantId: null, userId: 77, accion: 'asistente.admin_consulta' });
            const detalles = JSON.parse(registro.detalles);
            expect(detalles).toMatchObject({ texto: 'cómo va la cola', tipo: 'respuesta', tokens: 42 });
            expect(detalles.herramientas).toEqual([{ nombre: 'cola_trabajos', resultado: 'resultado' }]);
        });

        it('sin clave del proveedor responde 503 y no llama al servicio', async () => {
            asistenteConfigurado.mockReturnValue(false);

            const res = await request(crearApp()).post(`${BASE}/comando`).send({ texto: 'hola' });

            expect(res.status).toBe(503);
            expect(AsistenteSistemaService.comando).not.toHaveBeenCalled();
        });

        it.each([
            ['solicitud', 400],
            ['limite', 429],
            ['timeout', 504],
            ['proveedor', 502],
            ['iteraciones', 422],
            ['interno', 500]
        ])('un error "%s" del servicio responde %i', async (codigo, estado) => {
            AsistenteSistemaService.comando.mockResolvedValue({ tipo: 'error', codigo, texto: 'mensaje', meta: {} });

            const res = await request(crearApp()).post(`${BASE}/comando`).send({ texto: 'hola' });

            expect(res.status).toBe(estado);
            expect(res.body).toMatchObject({ tipo: 'error', codigo });
        });

        it('un fallo inesperado responde 500 sin detalles', async () => {
            AsistenteSistemaService.comando.mockRejectedValue(new Error('SQL secreto'));

            const res = await request(crearApp()).post(`${BASE}/comando`).send({ texto: 'hola' });

            expect(res.status).toBe(500);
            expect(JSON.stringify(res.body)).not.toMatch(/SQL|secreto/);
        });

        it('limita las consultas por superadmin y por minuto', async () => {
            AsistenteSistemaService.comando.mockResolvedValue({ tipo: 'respuesta', texto: 'ok', meta: {} });
            const app = crearApp();

            await request(app).post(`${BASE}/comando`).send({ texto: 'a' });
            await request(app).post(`${BASE}/comando`).send({ texto: 'b' });
            const tercera = await request(app).post(`${BASE}/comando`).send({ texto: 'c' });

            expect(tercera.status).toBe(429);
            expect(tercera.body).toMatchObject({ tipo: 'error', codigo: 'limite' });
            expect(AsistenteSistemaService.comando).toHaveBeenCalledTimes(2);
        });
    });

    describe('POST /transcribir', () => {
        let transcriptor;

        beforeEach(() => {
            transcriptor = { transcribir: jest.fn().mockResolvedValue('cuántos restaurantes hay') };
            crearTranscriptor.mockReturnValue(transcriptor);
        });

        it('transcribe el audio del superadmin y lo audita sin restaurante, solo con el tamaño', async () => {
            const res = await dictar(crearApp(77));

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ tipo: 'transcripcion', texto: 'cuántos restaurantes hay' });
            const registro = TenantAuditService.log.mock.calls[0][0];
            expect(registro).toMatchObject({ tenantId: null, userId: 77, accion: 'asistente.admin_transcribir' });
            expect(JSON.parse(registro.detalles)).toMatchObject({ bytes: 3000, tipo: 'transcripcion' });
            expect(registro.detalles).not.toContain('restaurantes');
        });

        it('solo audio, no vacío y de menos de 1 MB', async () => {
            const app = crearApp();

            expect((await dictar(app, audio(), 'application/json')).status).toBe(415);
            expect((await dictar(crearApp(), audio(10))).status).toBe(400);
            expect((await dictar(crearApp(), audio(1024 * 1024 + 1))).status).toBe(413);
            expect(transcriptor.transcribir).not.toHaveBeenCalled();
        });

        it('un error del proveedor de voz se devuelve con su estado', async () => {
            transcriptor.transcribir.mockRejectedValue(new LlmError('timeout', 'tardó'));

            const res = await dictar(crearApp());

            expect(res.status).toBe(504);
        });

        it('sin clave responde 503 y no llega al proveedor', async () => {
            asistenteConfigurado.mockReturnValue(false);

            const res = await dictar(crearApp());

            expect(res.status).toBe(503);
            expect(transcriptor.transcribir).not.toHaveBeenCalled();
        });

        it('limita los dictados por superadmin y por minuto', async () => {
            const app = crearApp();

            await dictar(app);
            await dictar(app);
            const tercero = await dictar(app);

            expect(tercero.status).toBe(429);
            expect(transcriptor.transcribir).toHaveBeenCalledTimes(2);
        });
    });
});
