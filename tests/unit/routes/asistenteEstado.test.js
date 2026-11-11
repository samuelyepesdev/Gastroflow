const express = require('express');
const request = require('supertest');

jest.mock('../../../services/Shared/AuthService', () => ({
    hasPermission: (permisos, requerido) => Array.isArray(permisos) && permisos.includes(requerido)
}));
jest.mock('../../../services/Tenant/Asistente/llm', () => ({ asistenteConfigurado: jest.fn(() => true) }));
jest.mock('../../../services/Tenant/Asistente/AsistenteService', () => ({ comando: jest.fn(), confirmar: jest.fn() }));
jest.mock('../../../services/Admin/TenantAuditService', () => ({ log: jest.fn() }));
jest.mock('../../../repositories/Tenant/AsistenteRepository', () => ({ nombreAsistente: jest.fn() }));

const { asistenteConfigurado } = require('../../../services/Tenant/Asistente/llm');
const AsistenteRepository = require('../../../repositories/Tenant/AsistenteRepository');
const router = require('../../../routes/tenant/asistente');

function crearApp({ permisos = ['asistente.usar'], addons = ['asistente'] } = {}) {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
        req.user = { id: 9, permisos };
        req.tenant = { id: 5, addonSlugs: addons };
        res.locals.allowedByPlan = {};
        next();
    });
    app.use('/api/asistente', router);
    return app;
}

describe('GET /api/asistente/estado', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        asistenteConfigurado.mockReturnValue(true);
    });

    it('devuelve el nombre del asistente del restaurante de la sesión', async () => {
        AsistenteRepository.nombreAsistente.mockResolvedValue('Sazón');

        const res = await request(crearApp()).get('/api/asistente/estado');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ nombre: 'Sazón' });
        expect(AsistenteRepository.nombreAsistente).toHaveBeenCalledWith(5);
    });

    it('sin nombre configurado usa "Chef"', async () => {
        AsistenteRepository.nombreAsistente.mockResolvedValue(null);

        const res = await request(crearApp()).get('/api/asistente/estado');

        expect(res.body).toEqual({ nombre: 'Chef' });
    });

    it('sigue el mismo control de acceso que el resto: sin add-on o sin permiso responde 403', async () => {
        const sinAddon = await request(crearApp({ addons: [] })).get('/api/asistente/estado');
        const sinPermiso = await request(crearApp({ permisos: [] })).get('/api/asistente/estado');

        expect(sinAddon.status).toBe(403);
        expect(sinPermiso.status).toBe(403);
        expect(AsistenteRepository.nombreAsistente).not.toHaveBeenCalled();
    });

    it('si falla la base de datos no filtra el error y responde con el nombre por defecto', async () => {
        AsistenteRepository.nombreAsistente.mockRejectedValue(new Error('SQL secreto'));

        const res = await request(crearApp()).get('/api/asistente/estado');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ nombre: 'Chef' });
        expect(JSON.stringify(res.body)).not.toContain('SQL');
    });
});
