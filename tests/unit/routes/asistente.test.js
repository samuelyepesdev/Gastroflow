// Los límites se leen del entorno al cargar el router: fijarlos ANTES de requerirlo.
process.env.ASISTENTE_LIMITE_USUARIO_MIN = '3';
process.env.ASISTENTE_LIMITE_TENANT_MIN = '5';

const express = require('express');
const request = require('supertest');

jest.mock('../../../services/Shared/AuthService', () => ({
    hasPermission: (permisos, requerido) => Array.isArray(permisos) && permisos.includes(requerido)
}));
jest.mock('../../../services/Tenant/Asistente/llm', () => ({ asistenteConfigurado: jest.fn(() => true) }));
jest.mock('../../../services/Tenant/Asistente/AsistenteService', () => ({ comando: jest.fn(), confirmar: jest.fn() }));
jest.mock('../../../services/Admin/TenantAuditService', () => ({ log: jest.fn() }));

const AsistenteService = require('../../../services/Tenant/Asistente/AsistenteService');
const TenantAuditService = require('../../../services/Admin/TenantAuditService');
const { asistenteConfigurado } = require('../../../services/Tenant/Asistente/llm');
const router = require('../../../routes/tenant/asistente');

let contador = 1000;
/** Cada test usa tenant/usuario propios: los contadores del límite viven en memoria del proceso. */
const identidad = () => {
    contador += 1;
    return { tenantId: contador, userId: contador };
};

function crearApp({
    tenantId,
    userId,
    permisos = ['asistente.usar', 'mesas.ver'],
    addons = ['asistente'],
    plan,
    sinSesion
} = {}) {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
        if (!sinSesion) {
            req.user = { id: userId, permisos };
            req.tenant = { id: tenantId, addonSlugs: addons };
        }
        res.locals.allowedByPlan = plan ?? { mesas: true };
        next();
    });
    app.use('/api/asistente', router);
    return app;
}

const apropiada = (extra = {}) => {
    const id = identidad();
    return { app: crearApp({ ...id, ...extra }), ...id };
};

describe('rutas del asistente', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        asistenteConfigurado.mockReturnValue(true);
        AsistenteService.comando.mockResolvedValue({
            tipo: 'respuesta',
            texto: 'Hay 2 mesas libres.',
            meta: {
                herramientas: [{ nombre: 'mesas_libres', resultado: 'resultado' }],
                uso: { entrada: 10, salida: 5, total: 15 }
            }
        });
        AsistenteService.confirmar.mockResolvedValue({
            tipo: 'respuesta',
            texto: 'Listo.',
            meta: { herramientas: [{ nombre: 'liberar_mesa', resultado: 'resultado' }], uso: null }
        });
        TenantAuditService.log.mockResolvedValue();
    });

    describe('acceso (tres capas)', () => {
        it('sin sesión -> 401 y nada se ejecuta', async () => {
            const { app } = apropiada({ sinSesion: true });

            const r = await request(app).post('/api/asistente/comando').send({ texto: 'hola' });

            expect(r.status).toBe(401);
            expect(AsistenteService.comando).not.toHaveBeenCalled();
        });

        it.each([
            ['el restaurante no tiene el add-on', { addons: [] }],
            ['el restaurante no trae lista de add-ons', { addons: null }],
            ['el usuario no tiene el permiso asistente.usar', { permisos: ['mesas.ver'] }]
        ])('403 cuando %s, en comando y en confirmar', async (_n, extra) => {
            const { app } = apropiada(extra);

            const c = await request(app).post('/api/asistente/comando').send({ texto: 'hola' });
            const f = await request(app)
                .post('/api/asistente/confirmar')
                .send({ confirmationId: 'a'.repeat(32), aceptar: true });

            expect(c.status).toBe(403);
            expect(f.status).toBe(403);
            expect(AsistenteService.comando).not.toHaveBeenCalled();
            expect(AsistenteService.confirmar).not.toHaveBeenCalled();
        });

        it('un plan Premium/Definitivo no basta: el add-on se exige aparte', async () => {
            // Premium da el permiso a los admins sin add-on; el guard debe seguir cerrando.
            const { app } = apropiada({
                addons: [],
                permisos: ['asistente.usar'],
                plan: { mesas: true, asistente: true }
            });

            const r = await request(app).post('/api/asistente/comando').send({ texto: 'hola' });

            expect(r.status).toBe(403);
        });

        it('sin GROQ_API_KEY -> 503, pero solo a quien sí tiene acceso (no revela la configuración a los demás)', async () => {
            asistenteConfigurado.mockReturnValue(false);
            const autorizado = apropiada().app;
            const sinPermiso = apropiada({ permisos: [] }).app;

            expect((await request(autorizado).post('/api/asistente/comando').send({ texto: 'hola' })).status).toBe(503);
            expect((await request(sinPermiso).post('/api/asistente/comando').send({ texto: 'hola' })).status).toBe(403);
        });

        it('las peticiones rechazadas por acceso no gastan la cuota del restaurante', async () => {
            const { tenantId } = identidad();
            const intruso = crearApp({ tenantId, userId: 1, permisos: [] });
            const legitimo = crearApp({ tenantId, userId: 2 });

            for (let i = 0; i < 10; i++) {
                await request(intruso).post('/api/asistente/comando').send({ texto: 'hola' });
            }
            const r = await request(legitimo).post('/api/asistente/comando').send({ texto: 'hola' });

            expect(r.status).toBe(200);
        });
    });

    describe('POST /comando', () => {
        it('usa SIEMPRE el contexto de la sesión, nunca tenant/usuario que vengan en el cuerpo', async () => {
            const { app, tenantId, userId } = apropiada();

            const r = await request(app)
                .post('/api/asistente/comando')
                .send({
                    texto: 'qué mesas hay libres',
                    historial: [{ role: 'user', content: 'hola' }],
                    tenantId: 999,
                    userId: 1,
                    permisos: ['*']
                });

            expect(r.status).toBe(200);
            expect(AsistenteService.comando).toHaveBeenCalledWith(
                { tenantId, userId, permisos: ['asistente.usar', 'mesas.ver'], allowedByPlan: { mesas: true } },
                { texto: 'qué mesas hay libres', historial: [{ role: 'user', content: 'hola' }] }
            );
        });

        it('responde solo lo necesario: sin meta ni datos internos', async () => {
            const { app } = apropiada();

            const r = await request(app).post('/api/asistente/comando').send({ texto: 'hola' });

            expect(r.body).toEqual({ tipo: 'respuesta', texto: 'Hay 2 mesas libres.' });
        });

        it('una propuesta de escritura devuelve el id de confirmación y su vigencia', async () => {
            AsistenteService.comando.mockResolvedValue({
                tipo: 'confirmacion',
                texto: 'Agregar 4 × Ramen a la mesa 8. ¿Confirmo?',
                confirmationId: 'b'.repeat(32),
                expiraEnSegundos: 120,
                meta: { herramientas: [{ nombre: 'agregar_items', resultado: 'confirmacion' }], uso: null }
            });
            const { app } = apropiada();

            const r = await request(app).post('/api/asistente/comando').send({ texto: '4 ramen para la mesa 8' });

            expect(r.status).toBe(200);
            expect(r.body).toEqual({
                tipo: 'confirmacion',
                texto: 'Agregar 4 × Ramen a la mesa 8. ¿Confirmo?',
                confirmationId: 'b'.repeat(32),
                expiraEnSegundos: 120
            });
        });

        it('un cuerpo ausente o que no es JSON llega al servicio como comando vacío (que lo rechaza)', async () => {
            AsistenteService.comando.mockResolvedValue({
                tipo: 'error',
                codigo: 'solicitud',
                texto: 'Dime qué necesitas.',
                meta: { herramientas: [], uso: null }
            });
            const { app } = apropiada();

            const r = await request(app).post('/api/asistente/comando').set('Content-Type', 'text/plain').send('hola');

            expect(r.status).toBe(400);
            expect(AsistenteService.comando).toHaveBeenCalledWith(expect.anything(), {
                texto: undefined,
                historial: undefined
            });
        });

        it.each([
            ['sesion', 401],
            ['permisos', 403],
            ['solicitud', 400],
            ['confirmacion_invalida', 400],
            ['ejecucion', 400],
            ['iteraciones', 422],
            ['limite', 429],
            ['no_configurado', 503],
            ['timeout', 504],
            ['proveedor', 502],
            ['respuesta_invalida', 502],
            ['interno', 500],
            ['algo_desconocido', 500]
        ])('error "%s" -> HTTP %i con el mensaje seguro del servicio', async (codigo, estado) => {
            AsistenteService.comando.mockResolvedValue({
                tipo: 'error',
                codigo,
                texto: 'Mensaje seguro.',
                meta: { herramientas: [], uso: null }
            });
            const { app } = apropiada();

            const r = await request(app).post('/api/asistente/comando').send({ texto: 'hola' });

            expect(r.status).toBe(estado);
            expect(r.body).toEqual({ tipo: 'error', codigo, texto: 'Mensaje seguro.' });
        });

        it('si el servicio revienta responde 500 genérico sin filtrar el motivo', async () => {
            jest.spyOn(console, 'error').mockImplementation(() => {});
            AsistenteService.comando.mockRejectedValue(new Error("ER_BAD_FIELD_ERROR: Unknown column 'x'"));
            const { app } = apropiada();

            const r = await request(app).post('/api/asistente/comando').send({ texto: 'hola' });

            expect(r.status).toBe(500);
            expect(JSON.stringify(r.body)).not.toMatch(/ER_BAD_FIELD|column/i);
            console.error.mockRestore();
        });
    });

    describe('POST /confirmar', () => {
        it('pasa confirmationId y aceptar tal cual (el servicio decide) con el contexto de la sesión', async () => {
            const { app, tenantId, userId } = apropiada();

            const r = await request(app)
                .post('/api/asistente/confirmar')
                .send({ confirmationId: 'c'.repeat(32), aceptar: true, tenantId: 999 });

            expect(r.status).toBe(200);
            expect(r.body).toEqual({ tipo: 'respuesta', texto: 'Listo.' });
            expect(AsistenteService.confirmar).toHaveBeenCalledWith(expect.objectContaining({ tenantId, userId }), {
                confirmationId: 'c'.repeat(32),
                aceptar: true
            });
        });

        it('una confirmación vencida o ajena responde 400', async () => {
            AsistenteService.confirmar.mockResolvedValue({
                tipo: 'error',
                codigo: 'confirmacion_invalida',
                texto: 'Esa confirmación venció.',
                meta: { herramientas: [], uso: null }
            });
            const { app } = apropiada();

            const r = await request(app)
                .post('/api/asistente/confirmar')
                .send({ confirmationId: 'd'.repeat(32), aceptar: true });

            expect(r.status).toBe(400);
        });
    });

    describe('auditoría (tenant_audit)', () => {
        it('cada comando deja rastro con texto, herramientas y tokens, del tenant y usuario de la sesión', async () => {
            const { app, tenantId, userId } = apropiada();

            await request(app).post('/api/asistente/comando').send({ texto: 'qué mesas hay libres' });

            expect(TenantAuditService.log).toHaveBeenCalledTimes(1);
            const registro = TenantAuditService.log.mock.calls[0][0];
            expect(registro).toMatchObject({ tenantId, userId, accion: 'asistente.comando' });
            expect(JSON.parse(registro.detalles)).toEqual({
                texto: 'qué mesas hay libres',
                tipo: 'respuesta',
                herramientas: [{ nombre: 'mesas_libres', resultado: 'resultado' }],
                tokens: 15
            });
        });

        it('el texto auditado se acota a una línea corta', async () => {
            const { app } = apropiada();

            await request(app)
                .post('/api/asistente/comando')
                .send({ texto: `hola\n${'x'.repeat(400)}` });

            const detalles = JSON.parse(TenantAuditService.log.mock.calls[0][0].detalles);
            expect(detalles.texto.length).toBeLessThanOrEqual(300);
            expect(detalles.texto).not.toContain('\n');
        });

        it('los errores también se auditan con su código', async () => {
            AsistenteService.comando.mockResolvedValue({
                tipo: 'error',
                codigo: 'limite',
                texto: 'x',
                meta: { herramientas: [], uso: null }
            });
            const { app } = apropiada();

            await request(app).post('/api/asistente/comando').send({ texto: 'hola' });

            expect(JSON.parse(TenantAuditService.log.mock.calls[0][0].detalles)).toMatchObject({
                tipo: 'error',
                codigo: 'limite'
            });
        });

        it('confirmar audita si se aceptó y qué se ejecutó, sin guardar el id de confirmación', async () => {
            const { app, tenantId, userId } = apropiada();

            await request(app)
                .post('/api/asistente/confirmar')
                .send({ confirmationId: 'e'.repeat(32), aceptar: true });

            const registro = TenantAuditService.log.mock.calls[0][0];
            expect(registro).toMatchObject({ tenantId, userId, accion: 'asistente.confirmar' });
            expect(JSON.parse(registro.detalles)).toEqual({
                aceptar: true,
                tipo: 'respuesta',
                herramientas: [{ nombre: 'liberar_mesa', resultado: 'resultado' }],
                tokens: null
            });
            expect(registro.detalles).not.toContain('e'.repeat(32));
        });

        it('si la auditoría falla, el usuario igual recibe su respuesta', async () => {
            jest.spyOn(console, 'error').mockImplementation(() => {});
            TenantAuditService.log.mockRejectedValue(new Error('db caída'));
            const { app } = apropiada();

            const r = await request(app).post('/api/asistente/comando').send({ texto: 'hola' });

            expect(r.status).toBe(200);
            console.error.mockRestore();
        });
    });

    describe('límites de uso', () => {
        it('por usuario: pasado el máximo responde 429 y deja de llamar al modelo', async () => {
            const { app } = apropiada();

            const estados = [];
            for (let i = 0; i < 4; i++) {
                estados.push((await request(app).post('/api/asistente/comando').send({ texto: 'hola' })).status);
            }

            expect(estados).toEqual([200, 200, 200, 429]);
            expect(AsistenteService.comando).toHaveBeenCalledTimes(3);
        });

        it('el límite de un usuario no afecta a un usuario de otro restaurante', async () => {
            const a = apropiada().app;
            const b = apropiada().app;
            for (let i = 0; i < 4; i++) {
                await request(a).post('/api/asistente/comando').send({ texto: 'hola' });
            }

            const r = await request(b).post('/api/asistente/comando').send({ texto: 'hola' });

            expect(r.status).toBe(200);
        });

        it('por restaurante: varios usuarios suman y el siguiente recibe 429 aunque sea su primera petición', async () => {
            const { tenantId } = identidad();
            const usuario = n => crearApp({ tenantId, userId: n });
            const estados = [];
            for (const [n, veces] of [
                [1, 2],
                [2, 2],
                [3, 1]
            ]) {
                for (let i = 0; i < veces; i++) {
                    estados.push(
                        (await request(usuario(n)).post('/api/asistente/comando').send({ texto: 'hola' })).status
                    );
                }
            }
            const nuevo = await request(usuario(4)).post('/api/asistente/comando').send({ texto: 'hola' });

            expect(estados).toEqual([200, 200, 200, 200, 200]);
            expect(nuevo.status).toBe(429);
        });

        it('confirmar tiene su propio límite: agotar comandos no impide confirmar lo ya propuesto', async () => {
            const { app } = apropiada();
            for (let i = 0; i < 4; i++) {
                await request(app).post('/api/asistente/comando').send({ texto: 'hola' });
            }

            const r = await request(app)
                .post('/api/asistente/confirmar')
                .send({ confirmationId: 'f'.repeat(32), aceptar: false });

            expect(r.status).toBe(200);
        });
    });
});
