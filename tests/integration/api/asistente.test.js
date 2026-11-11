/**
 * Integración: el asistente está montado en la app real y exige sesión.
 * (El detalle de permisos, add-on y límites se prueba en tests/unit/routes/asistente.test.js.)
 */

const request = require('supertest');
const { app } = require('../../../server');
const db = require('../../../config/database');

afterAll(async () => {
    await db.end();
});

describe('API / asistente', () => {
    it.each(['/api/asistente/comando', '/api/asistente/confirmar'])(
        'POST %s sin sesión responde 401 a un cliente JSON',
        async ruta => {
            const res = await request(app).post(ruta).set('Accept', 'application/json').send({ texto: 'hola' });

            expect(res.status).toBe(401);
        }
    );

    it('sin sesión y sin Accept JSON nunca se ejecuta: redirige al login como el resto de rutas protegidas', async () => {
        const res = await request(app).post('/api/asistente/comando').send({ texto: 'hola' });

        expect([301, 302, 401]).toContain(res.status);
    });

    it('solo existen POST: un GET sin sesión tampoco llega al asistente', async () => {
        const res = await request(app).get('/api/asistente/comando').set('Accept', 'application/json');

        expect([401, 404]).toContain(res.status);
    });
});
