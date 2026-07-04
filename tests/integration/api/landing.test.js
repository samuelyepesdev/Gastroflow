const request = require('supertest');
const { app } = require('../../../server');

describe('Landing & Legal Routes Integration', () => {
    describe('GET /', () => {
        it('should respond with 200 and render the landing page', async () => {
            const res = await request(app).get('/');
            expect(res.status).toBe(200);
            expect(res.headers['content-type']).toMatch(/text\/html/);
            expect(res.text).toContain('GastroFlow');
            expect(res.text).toContain('--color-primary');
        });
    });

    describe('GET /legal/privacidad', () => {
        it('should respond with 200 and render privacy policy page', async () => {
            const res = await request(app).get('/legal/privacidad');
            expect(res.status).toBe(200);
            expect(res.headers['content-type']).toMatch(/text\/html/);
            expect(res.text).toContain('Política de Privacidad');
        });
    });

    describe('GET /legal/terminos', () => {
        it('should respond with 200 and render terms and conditions page', async () => {
            const res = await request(app).get('/legal/terminos');
            expect(res.status).toBe(200);
            expect(res.headers['content-type']).toMatch(/text\/html/);
            expect(res.text).toContain('Términos y Condiciones');
        });
    });
});
