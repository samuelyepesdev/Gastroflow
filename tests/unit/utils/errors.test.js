const {
    AppError,
    ValidationError,
    UnauthorizedError,
    ForbiddenError,
    NotFoundError,
    ConflictError,
    responderError
} = require('../../../utils/errors');
const errorHandler = require('../../../middleware/errorHandler');

jest.mock('../../../utils/logger', () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), audit: jest.fn() }));

const crearRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.render = jest.fn().mockReturnValue(res);
    return res;
};

describe('jerarquía de errores', () => {
    test.each([
        [ValidationError, 400],
        [UnauthorizedError, 401],
        [ForbiddenError, 403],
        [NotFoundError, 404],
        [ConflictError, 409]
    ])('%p lleva su código HTTP %p y sigue siendo un Error (instanceof y stack)', (Clase, status) => {
        const e = new Clase('mensaje');
        expect(e).toBeInstanceOf(AppError);
        expect(e).toBeInstanceOf(Error);
        expect(e.statusCode).toBe(status);
        expect(e.status).toBe(status); // compatibilidad con el código que lee error.status
        expect(e.message).toBe('mensaje');
        expect(e.name).toBe(Clase.name);
        expect(e.stack).toContain('mensaje');
    });

    test('conserva la causa original (cause)', () => {
        const causa = new Error('ER_ROW_IS_REFERENCED_2');
        expect(new ConflictError('x', 'C', { cause: causa }).cause).toBe(causa);
    });
});

describe('responderError', () => {
    test('un AppError 4xx responde con su estado, mensaje y código', () => {
        const res = crearRes();
        responderError(res, new NotFoundError('Cliente no encontrado', 'CLIENTE_NO_ENCONTRADO'), 'genérico');
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: 'Cliente no encontrado', codigo: 'CLIENTE_NO_ENCONTRADO' });
    });

    test('un error cualquiera (bug, BD) es un 500 genérico: el detalle interno NO se filtra', () => {
        const res = crearRes();
        responderError(
            res,
            new Error("ER_BAD_FIELD_ERROR: Unknown column 'x' in 'field list'"),
            'Error al crear cliente'
        );
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: 'Error al crear cliente' });
    });

    test('un AppError 5xx tampoco expone su mensaje', () => {
        const res = crearRes();
        responderError(res, new AppError('detalle interno', 500), 'Error al actualizar');
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: 'Error al actualizar' });
    });
});

describe('errorHandler global con AppError', () => {
    const req = { originalUrl: '/x', method: 'GET', headers: { accept: 'application/json' } };

    test('un AppError 4xx conserva su mensaje y código', () => {
        const res = crearRes();
        errorHandler(new ValidationError('El nombre es requerido', 'CLIENTE_NOMBRE_REQUERIDO'), req, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: 'El nombre es requerido', codigo: 'CLIENTE_NOMBRE_REQUERIDO' });
    });

    test('un error 4xx NO tipado (body-parser) sigue con el mensaje genérico (sin cambios)', () => {
        const res = crearRes();
        const e = Object.assign(new Error('Unexpected token < in JSON'), { status: 400 });
        errorHandler(e, req, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: 'Solicitud inválida' });
    });

    test('un error cualquiera sigue siendo 500 genérico', () => {
        const res = crearRes();
        errorHandler(new Error('boom'), req, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: 'Error interno del servidor' });
    });
});
