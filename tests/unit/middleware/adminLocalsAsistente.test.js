jest.mock('../../../config/database', () => ({ query: jest.fn() }));
jest.mock('../../../services/Tenant/Asistente/llm', () => ({ asistenteConfigurado: jest.fn() }));

const db = require('../../../config/database');
const adminLocals = require('../../../middleware/adminLocals');
const { asistenteConfigurado } = require('../../../services/Tenant/Asistente/llm');

async function ejecutar() {
    const res = { locals: {} };
    await adminLocals({}, res, () => {});
    return res.locals;
}

describe('adminLocals / asistente del sistema', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        db.query.mockResolvedValue([[{ c: 0 }]]);
    });

    it('expone que el asistente está disponible cuando hay clave del proveedor', async () => {
        asistenteConfigurado.mockReturnValue(true);

        expect((await ejecutar()).asistenteSistema).toBe(true);
    });

    it('sin clave del proveedor no se muestra el panel', async () => {
        asistenteConfigurado.mockReturnValue(false);

        expect((await ejecutar()).asistenteSistema).toBe(false);
    });
});
