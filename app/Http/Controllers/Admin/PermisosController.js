const PermisoRepository = require('../../../../repositories/Admin/PermisoRepository');
const TenantService = require('../../../../services/Admin/TenantService');

class PermisosController {
    // GET /admin/permisos
    static async index(req, res) {
        try {
            const tenants = await TenantService.getAllTenants();
            const secciones = await PermisoRepository.getPermisosAgrupadosPorSeccion();
            const activeTenantId = Number(req.query.tenantId) || (tenants[0] && tenants[0].id) || null;
            const usuarios = activeTenantId ? await PermisoRepository.getUsuariosByTenantId(activeTenantId) : [];

            const roles = await PermisoRepository.getAllRoles();
            const rolePresets = {};
            for (const r of roles) {
                if (r.nombre !== 'superadmin') {
                    rolePresets[r.nombre] = await PermisoRepository.getPermisoIdsByRol(r.id);
                }
            }

            res.render('admin/permisos', {
                user: req.user,
                tenants,
                secciones,
                usuarios,
                activeTenantId,
                rolePresets
            });
        } catch (error) {
            console.error('Error al cargar permisos:', error);
            res.status(500).render('errors/internal', { error });
        }
    }

    // GET /admin/permisos/usuarios
    static async listUsuarios(req, res) {
        try {
            const tenantId = parseInt(req.query.tenantId);
            if (!tenantId) {
                return res.json({ usuarios: [] });
            }
            const usuarios = await PermisoRepository.getUsuariosByTenantId(tenantId);
            res.json({ usuarios });
        } catch (error) {
            console.error('Error al listar usuarios:', error);
            res.status(500).json({ error: error.message || 'Error' });
        }
    }

    // GET /admin/permisos/usuario/:userId
    static async getUsuarioPermisos(req, res) {
        try {
            const userId = parseInt(req.params.userId);
            if (!userId) {
                return res.status(400).json({ error: 'userId inválido' });
            }
            const permisoIds = await PermisoRepository.getEffectivePermisoIdsByUser(userId);
            res.json({ permiso_ids: permisoIds });
        } catch (error) {
            console.error('Error al cargar permisos del usuario:', error);
            res.status(500).json({ error: error.message || 'Error' });
        }
    }

    // PUT /admin/permisos/usuario/:userId
    static async updateUsuarioPermisos(req, res) {
        try {
            const userId = parseInt(req.params.userId);
            const permisoIds = Array.isArray(req.body.permiso_ids)
                ? req.body.permiso_ids.map(id => parseInt(id)).filter(id => !isNaN(id))
                : [];
            if (!userId) {
                return res.status(400).json({ error: 'userId inválido' });
            }
            await PermisoRepository.setPermisosForUser(userId, permisoIds);
            res.json({ success: true, message: 'Permisos guardados. Los cambios se aplican al instante.' });
        } catch (error) {
            console.error('Error al actualizar permisos del usuario:', error);
            res.status(500).json({ error: error.message || 'Error al actualizar' });
        }
    }
}

module.exports = PermisosController;
