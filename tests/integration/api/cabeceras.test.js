/**
 * Cabeceras de seguridad globales. El micrófono debe poder usarse desde nuestro propio origen
 * (el asistente dicta por voz) y seguir cerrado para cualquier página incrustada de terceros.
 */
const request = require('supertest');
const { app } = require('../../../server');
const db = require('../../../config/database');

afterAll(async () => {
    await db.end();
});

describe('Permissions-Policy', () => {
    it('permite el micrófono solo al propio origen y mantiene cerradas la cámara y la geolocalización', async () => {
        const res = await request(app).get('/auth/login');
        const politica = res.headers['permissions-policy'];

        expect(politica).toContain('microphone=(self)');
        expect(politica).toContain('camera=()');
        expect(politica).toContain('geolocation=()');
    });
});
