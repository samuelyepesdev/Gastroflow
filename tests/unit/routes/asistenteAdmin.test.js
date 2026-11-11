const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');

jest.mock('../../../services/Admin/AsistenteAdminService', () => ({
    resumen: jest.fn(),
    usuarios: jest.fn(),
    activarAddon: jest.fn(),
    renombrar: jest.fn(),
    fijarAcceso: jest.fn()
}));

const AsistenteAdminService = require('../../../services/Admin/AsistenteAdminService');
const router = require('../../../routes/admin/asistente');

function crearApp() {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
        req.user = { id: 1, rol: 'superadmin' };
        res.render = (vista, datos) => res.json({ vista, datos });
        next();
    });
    app.use('/admin/asistente', router);
    return app;
}

const errorDe = (status, message) => Object.assign(new Error(message), { status });

describe('admin / asistente', () => {
    let app;
    let errorSpy;

    beforeEach(() => {
        jest.resetAllMocks();
        errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        app = crearApp();
    });

    afterEach(() => errorSpy.mockRestore());

    it('la página se pinta con la vista del módulo y marca el menú activo', async () => {
        const res = await request(app).get('/admin/asistente');

        expect(res.status).toBe(200);
        expect(res.body.vista).toBe('admin/asistente/index');
        expect(res.body.datos).toMatchObject({ currentAdminPage: 'asistente' });
    });

    it('GET /api/resumen devuelve el resumen del servicio', async () => {
        AsistenteAdminService.resumen.mockResolvedValue({ servidor: { configurado: true }, restaurantes: [] });

        const res = await request(app).get('/admin/asistente/api/resumen');

        expect(res.status).toBe(200);
        expect(res.body.servidor.configurado).toBe(true);
    });

    it('GET /api/tenants/:id/usuarios lista los usuarios del restaurante', async () => {
        AsistenteAdminService.usuarios.mockResolvedValue([{ id: 3 }]);

        const res = await request(app).get('/admin/asistente/api/tenants/4/usuarios');

        expect(res.body).toEqual([{ id: 3 }]);
        expect(AsistenteAdminService.usuarios).toHaveBeenCalledWith(4);
    });

    it('PUT addon pasa el restaurante, el booleano y el superadmin de la sesión', async () => {
        AsistenteAdminService.activarAddon.mockResolvedValue({ activo: true });

        const res = await request(app).put('/admin/asistente/api/tenants/4/addon').send({ activo: true });

        expect(res.status).toBe(200);
        expect(AsistenteAdminService.activarAddon).toHaveBeenCalledWith(4, true, 1);
    });

    it.each([['true'], [1], [null], [undefined]])(
        'PUT addon rechaza un "activo" que no es booleano (%p)',
        async activo => {
            const res = await request(app).put('/admin/asistente/api/tenants/4/addon').send({ activo });

            expect(res.status).toBe(400);
            expect(AsistenteAdminService.activarAddon).not.toHaveBeenCalled();
        }
    );

    it('PUT nombre y PUT acceso delegan en el servicio con el superadmin de la sesión', async () => {
        AsistenteAdminService.renombrar.mockResolvedValue({ nombre: 'Sazón' });
        AsistenteAdminService.fijarAcceso.mockResolvedValue({ modo: 'conceder' });

        await request(app).put('/admin/asistente/api/tenants/4/nombre').send({ nombre: 'Sazón' }).expect(200);
        await request(app)
            .put('/admin/asistente/api/tenants/4/usuarios/8/acceso')
            .send({ modo: 'conceder' })
            .expect(200);

        expect(AsistenteAdminService.renombrar).toHaveBeenCalledWith(4, 'Sazón', 1);
        expect(AsistenteAdminService.fijarAcceso).toHaveBeenCalledWith(4, 8, 'conceder', 1);
    });

    it('los ids de la URL que no son enteros llegan inválidos al servicio y se rechazan con su estado', async () => {
        AsistenteAdminService.usuarios.mockRejectedValue(errorDe(400, 'Restaurante inválido'));

        const res = await request(app).get('/admin/asistente/api/tenants/abc/usuarios');

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'Restaurante inválido' });
        expect(AsistenteAdminService.usuarios).toHaveBeenCalledWith(NaN);
    });

    it('un error de negocio conserva su estado y mensaje; uno inesperado responde 500 sin detalles', async () => {
        AsistenteAdminService.fijarAcceso.mockRejectedValueOnce(
            errorDe(404, 'Usuario no encontrado en este restaurante')
        );
        AsistenteAdminService.fijarAcceso.mockRejectedValueOnce(new Error('SQL: tabla secreta'));

        const noEncontrado = await request(app)
            .put('/admin/asistente/api/tenants/4/usuarios/9/acceso')
            .send({ modo: 'conceder' });
        const interno = await request(app)
            .put('/admin/asistente/api/tenants/4/usuarios/9/acceso')
            .send({ modo: 'conceder' });

        expect(noEncontrado.status).toBe(404);
        expect(noEncontrado.body.error).toMatch(/no encontrado/i);
        expect(interno.status).toBe(500);
        expect(JSON.stringify(interno.body)).not.toMatch(/SQL|secreta/);
    });

    it('el módulo solo se monta detrás de requireSuperadmin y aparece en el menú del panel', () => {
        const web = fs.readFileSync(path.join(__dirname, '../../../routes/web.js'), 'utf8');
        const menu = fs.readFileSync(path.join(__dirname, '../../../utils/adminSections.js'), 'utf8');

        expect(web).toMatch(/router\.use\('\/admin\/asistente', requireSuperadmin,/);
        expect(menu).toMatch(/key: 'asistente'[^}]*href: '\/admin\/asistente'/);
    });
});
