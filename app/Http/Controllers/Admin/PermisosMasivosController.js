const PermisosMasivosService = require('../../../../services/Admin/PermisosMasivosService');
const PermisoRepository = require('../../../../repositories/Admin/PermisoRepository');
const PlanService = require('../../../../services/Admin/PlanService');

const responderError = (res, error, mensajePorDefecto) => {
    if (error.status) {
        return res.status(error.status).json({ error: error.message });
    }
    console.error(mensajePorDefecto, error);
    return res.status(500).json({ error: mensajePorDefecto });
};

class PermisosMasivosController {
    // GET /admin/permisos/masivo
    static async index(req, res) {
        try {
            const [restaurantes, planes, secciones, roles, matriz] = await Promise.all([
                PermisosMasivosService.listarRestaurantes(),
                PlanService.getAll(),
                PermisoRepository.getPermisosAgrupadosPorSeccion(),
                PermisoRepository.getAllRoles(),
                PermisosMasivosService.obtenerMatrizRoles()
            ]);
            res.render('admin/permisos/masivo', {
                user: req.user,
                restaurantes,
                planes: planes.map(p => ({ id: p.id, nombre: p.nombre })),
                secciones,
                roles: roles.filter(r => r.nombre !== 'superadmin'),
                matriz,
                title: 'Permisos masivos',
                currentAdminPage: 'permisos-masivo'
            });
        } catch (error) {
            console.error('Error cargando permisos masivos:', error);
            res.status(500).render('errors/generic', {
                error: { message: 'Error al cargar la gestión masiva de permisos' }
            });
        }
    }

    // POST /admin/permisos/masivo/previsualizar
    static async previsualizar(req, res) {
        try {
            res.json(await PermisosMasivosService.previsualizar(req.body || {}));
        } catch (error) {
            responderError(res, error, 'No se pudo calcular la vista previa');
        }
    }

    // POST /admin/permisos/masivo/aplicar
    static async aplicar(req, res) {
        try {
            const resumen = await PermisosMasivosService.aplicar(req.body || {}, { superadminId: req.user.id });
            res.json({ success: true, ...resumen });
        } catch (error) {
            responderError(res, error, 'No se pudo aplicar el cambio');
        }
    }

    // GET /admin/permisos/masivo/excepciones
    static async excepciones(req, res) {
        try {
            const { tenantId, rol, q } = req.query;
            res.json(await PermisosMasivosService.listarExcepciones({ tenantId, rol, q }));
        } catch (error) {
            responderError(res, error, 'No se pudo cargar el reporte de excepciones');
        }
    }

    // POST /admin/permisos/masivo/excepciones/reiniciar
    static async reiniciar(req, res) {
        try {
            const r = await PermisosMasivosService.reiniciarUsuarios((req.body || {}).user_ids, {
                superadminId: req.user.id
            });
            res.json({ success: true, ...r });
        } catch (error) {
            responderError(res, error, 'No se pudo volver al estándar');
        }
    }

    // PUT /admin/permisos/masivo/roles/:rolId
    static async guardarRol(req, res) {
        try {
            const rolId = Number.parseInt(req.params.rolId, 10);
            if (!rolId) {
                return res.status(400).json({ error: 'Rol inválido' });
            }
            const r = await PermisosMasivosService.guardarPermisosRol(rolId, (req.body || {}).permiso_ids, {
                superadminId: req.user.id
            });
            res.json({ success: true, ...r });
        } catch (error) {
            responderError(res, error, 'No se pudo guardar el rol');
        }
    }

    // GET /admin/permisos/masivo/auditoria
    static async auditoria(req, res) {
        try {
            res.json({ registros: await PermisosMasivosService.listarAuditoria(50) });
        } catch (error) {
            responderError(res, error, 'No se pudo cargar la auditoría');
        }
    }
}

module.exports = PermisosMasivosController;
