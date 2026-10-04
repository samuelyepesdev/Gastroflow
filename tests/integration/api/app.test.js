/**
 * Tests de integración: app Express (rutas públicas sin BD o que no dependen de tenant)
 * Para rutas que usan BD, usar .env.test con una BD de pruebas o mockear el módulo db.
 */

const request = require('supertest');
const { app } = require('../../../server');
const db = require('../../../config/database');

// El pool de MySQL se crea al importar la app; sin cerrarlo, Jest no termina
// cuando hay una BD real (CI) y el job se queda colgado.
afterAll(async () => {
    await db.end();
});

describe('API / app', () => {
    describe('GET /auth/login', () => {
        it('responde con 200 y HTML de login', async () => {
            const res = await request(app).get('/auth/login');
            expect(res.status).toBe(200);
            expect(res.headers['content-type']).toMatch(/text\/html/);
            expect(res.text).toContain('Iniciar'); // título o texto típico del login
        });
    });

    describe('Rutas inexistentes', () => {
        it('responde 404 para GET /ruta-inexistente', async () => {
            const res = await request(app).get('/ruta-inexistente');
            expect(res.status).toBe(404);
        });

        it('responde con JSON de error para peticiones XHR a ruta inexistente', async () => {
            const res = await request(app).get('/api/no-existe').set('Accept', 'application/json');
            expect(res.status).toBe(404);
            expect(res.body).toHaveProperty('error');
        });
    });
});
