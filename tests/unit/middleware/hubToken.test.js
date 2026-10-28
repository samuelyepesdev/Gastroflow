const hubToken = require('../../../middleware/hubToken');

function respuesta() {
    const res = { statusCode: 200 };
    res.status = jest.fn(codigo => {
        res.statusCode = codigo;
        return res;
    });
    res.json = jest.fn(() => res);
    return res;
}

const pedir = cabecera => ({ get: jest.fn(() => cabecera) });

describe('hubToken', () => {
    const original = process.env.HUB_TOKEN;
    afterEach(() => {
        if (original === undefined) {
            delete process.env.HUB_TOKEN;
        } else {
            process.env.HUB_TOKEN = original;
        }
    });

    it('responde 404 si la integración está apagada (sin HUB_TOKEN)', () => {
        delete process.env.HUB_TOKEN;
        const res = respuesta();
        const next = jest.fn();
        hubToken(pedir('Bearer lo-que-sea'), res, next);
        expect(res.status).toHaveBeenCalledWith(404);
        expect(next).not.toHaveBeenCalled();
    });

    it('responde 401 sin token o con token incorrecto', () => {
        process.env.HUB_TOKEN = 'token-correcto-largo';
        for (const cabecera of [undefined, '', 'Bearer', 'Bearer incorrecto', 'token-correcto-largo-pero-mas-largo']) {
            const res = respuesta();
            const next = jest.fn();
            hubToken(pedir(cabecera), res, next);
            expect(res.status).toHaveBeenCalledWith(401);
            expect(next).not.toHaveBeenCalled();
        }
    });

    it('deja pasar con el token correcto', () => {
        process.env.HUB_TOKEN = 'token-correcto-largo';
        const res = respuesta();
        const next = jest.fn();
        hubToken(pedir('Bearer token-correcto-largo'), res, next);
        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });
});
