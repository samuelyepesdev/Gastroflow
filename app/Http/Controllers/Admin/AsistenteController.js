const AsistenteAdminService = require('../../../../services/Admin/AsistenteAdminService');

/** Un error de negocio trae `status`; cualquier otra cosa es interna y no se detalla al cliente. */
function fallar(res, error) {
    if (error && Number.isInteger(error.status) && error.status >= 400 && error.status < 500) {
        return res.status(error.status).json({ error: error.message });
    }
    // eslint-disable-next-line no-console
    console.error('[asistente-admin] error:', error?.name, error?.message);
    return res.status(500).json({ error: 'No se pudo completar la operación.' });
}

/** Ejecuta la operación y responde su resultado en JSON. */
async function responder(res, operacion) {
    try {
        return res.json(await operacion());
    } catch (error) {
        return fallar(res, error);
    }
}

const tenantDe = req => Number(req.params.tenantId);

class AsistenteAdminController {
    // GET /admin/asistente
    static index(req, res) {
        res.render('admin/asistente/index', {
            user: req.user,
            title: 'Asistente Chef',
            currentAdminPage: 'asistente'
        });
    }

    // GET /admin/asistente/api/resumen
    static resumen(req, res) {
        return responder(res, () => AsistenteAdminService.resumen());
    }

    // GET /admin/asistente/api/tenants/:tenantId/usuarios
    static usuarios(req, res) {
        return responder(res, () => AsistenteAdminService.usuarios(tenantDe(req)));
    }

    // PUT /admin/asistente/api/tenants/:tenantId/addon  { activo: boolean }
    static addon(req, res) {
        const activo = req.body?.activo;
        if (typeof activo !== 'boolean') {
            return res.status(400).json({ error: '"activo" debe ser verdadero o falso.' });
        }
        return responder(res, () => AsistenteAdminService.activarAddon(tenantDe(req), activo, req.user.id));
    }

    // PUT /admin/asistente/api/tenants/:tenantId/nombre  { nombre }
    static nombre(req, res) {
        return responder(res, () => AsistenteAdminService.renombrar(tenantDe(req), req.body?.nombre, req.user.id));
    }

    // PUT /admin/asistente/api/tenants/:tenantId/usuarios/:userId/acceso  { modo }
    static acceso(req, res) {
        return responder(res, () =>
            AsistenteAdminService.fijarAcceso(tenantDe(req), Number(req.params.userId), req.body?.modo, req.user.id)
        );
    }
}

module.exports = AsistenteAdminController;
