const express = require('express');
const request = require('supertest');

jest.mock('../../../app/Http/Controllers/Tenant/ClientesController', () => {
    const ok = (req, res) => res.json({ id: Number(req.params.id) });
    return { index: ok, search: ok, show: ok, store: ok, update: ok, destroy: ok };
});
jest.mock('../../../middleware/auth', () => ({
    requirePermission: () => (req, res, next) => next()
}));

const clientesRouter = require('../../../routes/tenant/clientes');
const { validationResult } = require('express-validator');
const LoginRequest = require('../../../app/Http/Requests/Auth/LoginRequest');

describe('id de clientes', () => {
    const app = express();
    app.use(express.json());
    app.use('/clientes', clientesRouter);

    it.each(['abc', '1%20OR%201=1', '-1', '1.5'])('rechaza %s con 400', async id => {
        const res = await request(app).get(`/clientes/${id}`);
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Identificador inválido');
    });

    it('acepta un id numérico', async () => {
        const res = await request(app).get('/clientes/7');
        expect(res.status).toBe(200);
        expect(res.body.id).toBe(7);
    });

    it('rechaza ids inválidos también en PUT y DELETE', async () => {
        expect((await request(app).delete('/clientes/abc')).status).toBe(400);
        expect((await request(app).put('/clientes/abc').send({})).status).toBe(400);
    });
});

describe('LoginRequest: largo máximo', () => {
    const run = async body => {
        const req = { body };
        for (const rule of LoginRequest.rules()) {
            await rule.run(req);
        }
        return validationResult(req)
            .array()
            .map(e => e.msg);
    };

    it('acepta credenciales normales', async () => {
        expect(await run({ username: 'admin', password: 'admin123' })).toEqual([]);
    });

    it('rechaza un username gigante', async () => {
        expect(await run({ username: 'x'.repeat(5000), password: 'y' })).toContain(
            'El nombre de usuario es demasiado largo'
        );
    });

    it('rechaza una contraseña gigante', async () => {
        expect(await run({ username: 'admin', password: 'y'.repeat(5000) })).toContain(
            'La contraseña es demasiado larga'
        );
    });
});

describe('manejador global de errores', () => {
    jest.mock('../../../utils/logger', () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }));
    const errorHandler = require('../../../middleware/errorHandler');
    const app = express();
    app.use(express.json());
    app.post('/auth/login', (req, res) => res.json({ ok: true }));
    app.get('/boom', () => {
        throw new Error('fallo interno');
    });
    app.use(errorHandler);

    it('un fallo interno sigue siendo 500 genérico', async () => {
        const res = await request(app).get('/boom').set('Accept', 'application/json');
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Error interno del servidor');
    });

    it('JSON malformado responde 400 y no 500', async () => {
        const res = await request(app)
            .post('/auth/login')
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/json')
            .send('{"username":');
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Solicitud inválida');
    });
});
