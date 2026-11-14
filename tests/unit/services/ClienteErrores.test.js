jest.mock('../../../repositories/Tenant/ClienteRepository');
jest.mock('../../../services/Shared/ParametroService', () => ({}));
jest.spyOn(console, 'error').mockImplementation(() => {});

const ClienteRepository = require('../../../repositories/Tenant/ClienteRepository');
const ClienteService = require('../../../services/Tenant/ClienteService');
const ClientesController = require('../../../app/Http/Controllers/Tenant/ClientesController');
const { NotFoundError, ValidationError, ConflictError } = require('../../../utils/errors');

const crearRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};
const req = (extra = {}) => ({ tenant: { id: 1 }, params: { id: '5' }, body: {}, ...extra });

describe('ClienteService lanza errores tipados (mismos mensajes que antes)', () => {
    beforeEach(() => jest.clearAllMocks());

    test('cliente inexistente -> NotFoundError', async () => {
        ClienteRepository.findById.mockResolvedValue(null);
        const e = await ClienteService.getById(5, 1).catch(x => x);
        expect(e).toBeInstanceOf(NotFoundError);
        expect(e.message).toBe('Cliente no encontrado');
        expect(e.code).toBe('CLIENTE_NO_ENCONTRADO');
    });

    test('nombre vacío y teléfono con letras -> ValidationError', async () => {
        await expect(ClienteService.create(1, { nombre: '  ' })).rejects.toBeInstanceOf(ValidationError);
        await expect(ClienteService.create(1, { nombre: 'Ana', telefono: '300abc' })).rejects.toMatchObject({
            statusCode: 400,
            message: 'El teléfono solo puede contener números'
        });
    });

    test('eliminar un cliente con facturas -> ConflictError (conserva la causa)', async () => {
        ClienteRepository.findById.mockResolvedValue({ id: 5 });
        const causa = Object.assign(new Error('fk'), { code: 'ER_ROW_IS_REFERENCED_2' });
        ClienteRepository.delete.mockRejectedValue(causa);
        const e = await ClienteService.delete(5, 1).catch(x => x);
        expect(e).toBeInstanceOf(ConflictError);
        expect(e.statusCode).toBe(409);
        expect(e.cause).toBe(causa);
    });
});

describe('ClientesController responde por tipo de error, no por el texto del mensaje', () => {
    beforeEach(() => jest.clearAllMocks());

    test('PUT con teléfono inválido ahora es 400 (antes caía en 500 porque el mensaje no decía "requerido")', async () => {
        const res = crearRes();
        await ClientesController.update(req({ body: { nombre: 'Ana', telefono: 'abc' } }), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            error: 'El teléfono solo puede contener números',
            codigo: 'CLIENTE_TELEFONO_INVALIDO'
        });
    });

    test('PUT de un cliente inexistente es 404', async () => {
        ClienteRepository.findById.mockResolvedValue(null);
        const res = crearRes();
        await ClientesController.update(req({ body: { nombre: 'Ana' } }), res);
        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('DELETE de un cliente con facturas es 409 (antes 400)', async () => {
        ClienteRepository.findById.mockResolvedValue({ id: 5 });
        ClienteRepository.delete.mockRejectedValue(Object.assign(new Error('fk'), { code: 'ER_ROW_IS_REFERENCED_2' }));
        const res = crearRes();
        await ClientesController.destroy(req(), res);
        expect(res.status).toHaveBeenCalledWith(409);
    });

    test('un fallo inesperado (BD) sigue siendo 500 genérico, sin filtrar el detalle', async () => {
        ClienteRepository.findById.mockRejectedValue(new Error("Unknown column 'x'"));
        const res = crearRes();
        await ClientesController.destroy(req(), res);
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: 'Error al eliminar cliente' });
    });
});
