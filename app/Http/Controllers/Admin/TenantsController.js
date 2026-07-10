const TenantService = require('../../../../services/Admin/TenantService');
const TenantUserService = require('../../../../services/Admin/TenantUserService');
const TenantAuditService = require('../../../../services/Admin/TenantAuditService');
const CategoryService = require('../../../../services/Admin/CategoryService');
const PlanService = require('../../../../services/Admin/PlanService');
const { syncPlanPermissionsToTenantUsers } = require('../../../../services/Admin/PlanPermissionSyncService');
const ParametroService = require('../../../../services/Shared/ParametroService');

class TenantsController {
    // GET /admin/tenants
    static async index(req, res) {
        try {
            const tenants = await TenantService.getAllTenants();
            const plans = await PlanService.getAll();
            const tenantId = Number(req.query.tenantId) || (tenants[0] && tenants[0].id);
            const tenantUsers = tenantId ? await TenantUserService.getUsersByTenant(tenantId) : [];
            const FacturacionElectronicaConfigService = require('../../../../services/Tenant/FacturacionElectronicaConfigService');
            const facturacionElectronica = tenantId
                ? await FacturacionElectronicaConfigService.getForAdmin(tenantId)
                : null;
            res.render('admin/tenants', {
                user: req.user,
                tenants,
                plans,
                tenantUsers,
                activeTenantId: tenantId,
                facturacionElectronica
            });
        } catch (error) {
            console.error('Error al listar tenants:', error);
            res.status(500).render('errors/internal', { error });
        }
    }

    // POST /admin/tenants
    static async store(req, res) {
        try {
            const {
                nombre,
                email,
                slug,
                config,
                plan_id,
                admin_username,
                admin_password,
                admin_email,
                admin_nombre_completo,
                nit,
                direccion,
                telefono,
                ciudad,
                regimen_fiscal
            } = req.body;
            if (!nombre || !slug || !admin_username || !admin_password) {
                return res.status(400).send('Faltan nombre del restaurante, slug, usuario admin o contraseña.');
            }
            const configObj = typeof config === 'string' ? JSON.parse(config || '{}') : config || {};
            const tenant = await TenantService.createTenant({
                nombre,
                email,
                slug,
                config: configObj,
                plan_id: plan_id || 1,
                nit,
                direccion,
                telefono,
                ciudad,
                regimen_fiscal
            });
            const tenantId = tenant.id;
            const tipoNegocio = configObj.tipo_negocio || 'restaurante';
            await CategoryService.seedDefaultCategories(tenantId, tipoNegocio);
            await ParametroService.seedInventoryParams(tenantId);
            await TenantUserService.createTenantUser(tenantId, {
                username: admin_username,
                password: admin_password,
                email: admin_email || null,
                nombre_completo: admin_nombre_completo || null,
                rol_nombre: 'admin'
            });
            await TenantAuditService.log({
                tenantId,
                userId: req.user?.id || null,
                accion: 'crear_tenant',
                detalles: `slug=${slug} admin=${admin_username}`
            });
            res.redirect('/admin/tenants');
        } catch (error) {
            console.error('Error al crear tenant:', error);
            res.status(400).send(error.message);
        }
    }

    // PUT /admin/tenants/:id
    static async update(req, res) {
        try {
            const update = {};
            const textFields = [
                'nombre',
                'email',
                'nit',
                'direccion',
                'telefono',
                'ciudad',
                'regimen_fiscal',
                'tributo_default',
                'tasa_impuesto_default'
            ];
            textFields.forEach(f => {
                if (req.body[f] !== undefined) {
                    update[f] = req.body[f];
                }
            });

            if (req.body.activo !== undefined && req.body.activo !== null && req.body.activo !== '') {
                update.activo =
                    req.body.activo === 'true' ||
                    req.body.activo === true ||
                    req.body.activo === 1 ||
                    req.body.activo === '1';
            }

            if (req.body.config !== undefined && req.body.config !== null) {
                update.config = typeof req.body.config === 'string' ? JSON.parse(req.body.config) : req.body.config;
            }

            const { plan_id } = req.body;
            const planChanged = plan_id !== undefined && plan_id !== null && plan_id !== '';
            if (planChanged) {
                update.plan_id = plan_id;
            }

            await TenantService.updateTenant(req.params.id, update);
            if (planChanged && plan_id) {
                await syncPlanPermissionsToTenantUsers(Number(req.params.id), Number(plan_id));
            }
            await TenantAuditService.log({
                tenantId: req.params.id,
                userId: req.user?.id || null,
                accion: 'actualizar_config',
                detalles: `Activo=${req.body.activo}${planChanged ? ` Plan=${plan_id}` : ''}`
            });
            if (planChanged) {
                res.status(200).json({ planUpdated: true });
            } else {
                res.sendStatus(204);
            }
        } catch (error) {
            console.error('Error al actualizar tenant:', error);
            res.status(400).json({ error: error.message, stack: error.stack });
        }
    }

    // DELETE /admin/tenants/:id
    static async destroy(req, res) {
        try {
            if (req.params.id === '1') {
                return res
                    .status(403)
                    .json({ success: false, message: 'No se puede eliminar el restaurante principal.' });
            }
            await TenantService.deleteTenant(req.params.id);
            res.status(200).json({ success: true, message: 'Restaurante eliminado permanentemente.' });
        } catch (error) {
            console.error('Error al eliminar tenant:', error);
            res.status(500).json({ success: false, message: error.message || 'Error al eliminar restaurante.' });
        }
    }

    // POST /admin/tenants/:id/status
    static async updateStatus(req, res) {
        try {
            const { activo } = req.body;
            const activoBool = activo === true || activo === 'true';
            await TenantService.changeTenantStatus(req.params.id, activoBool);
            await TenantAuditService.log({
                tenantId: req.params.id,
                userId: req.user?.id || null,
                accion: activoBool ? 'activar_tenant' : 'desactivar_tenant',
                detalles: null
            });
            res.sendStatus(204);
        } catch (error) {
            res.status(400).send(error.message);
        }
    }

    // POST /admin/tenants/:id/users
    static async storeUser(req, res) {
        try {
            const { username, password, email, nombre_completo, rol_nombre } = req.body;
            const userId = await TenantUserService.createTenantUser(req.params.id, {
                username,
                password,
                email,
                nombre_completo,
                rol_nombre
            });
            await TenantAuditService.log({
                tenantId: req.params.id,
                userId: userId || null,
                accion: 'crear_usuario',
                detalles: `user=${username} rol=${rol_nombre}`
            });
            res.redirect('/admin/tenants');
        } catch (error) {
            res.status(400).send(error.message);
        }
    }

    // PATCH /admin/tenants/:tenantId/users/:userId/roles
    static async updateUserRole(req, res) {
        try {
            const { rol_nombre } = req.body;
            await TenantUserService.assignRoles(req.params.userId, req.params.tenantId, rol_nombre);
            await TenantAuditService.log({
                tenantId: req.params.tenantId,
                userId: req.params.userId,
                accion: 'asignar_rol',
                detalles: `rol=${rol_nombre}`
            });
            res.sendStatus(204);
        } catch (error) {
            res.status(400).send(error.message);
        }
    }

    // POST /admin/tenants/:tenantId/users/batch-roles
    static async batchUpdateRoles(req, res) {
        try {
            const { changes } = req.body;
            if (!Array.isArray(changes)) {
                throw new Error('Formato de cambios inválido');
            }
            for (const change of changes) {
                await TenantUserService.assignRoles(change.userId, Number(req.params.tenantId), change.rol_nombre);
                await TenantAuditService.log({
                    tenantId: req.params.tenantId,
                    userId: req.user?.id || null,
                    accion: 'asignar_rol_batch',
                    detalles: `usuario_id=${change.userId} rol=${change.rol_nombre}`
                });
            }
            res.status(200).json({ success: true, message: 'Roles actualizados correctamente.' });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    // POST /admin/tenants/:tenantId/users/:userId/status
    static async updateUserStatus(req, res) {
        try {
            const { activo } = req.body;
            const activoBool = activo === true || activo === 'true';
            await TenantUserService.changeTenantUserStatus(req.params.userId, req.params.tenantId, activoBool);
            await TenantAuditService.log({
                tenantId: req.params.tenantId,
                userId: req.params.userId,
                accion: activoBool ? 'activar_usuario' : 'bloquear_usuario',
                detalles: null
            });
            res.sendStatus(204);
        } catch (error) {
            res.status(400).send(error.message);
        }
    }

    // PUT /admin/tenants/:tenantId/users/:userId/password
    static async updateUserPassword(req, res) {
        try {
            const { newPassword, newPasswordConfirm } = req.body;
            if (!newPassword || newPassword.length < 6) {
                return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
            }
            if (newPassword !== newPasswordConfirm) {
                return res.status(400).json({ error: 'La confirmación no coincide con la nueva contraseña.' });
            }
            await TenantUserService.setPassword(req.params.userId, req.params.tenantId, newPassword);
            await TenantAuditService.log({
                tenantId: req.params.tenantId,
                userId: req.user?.id || null,
                accion: 'cambiar_password_usuario',
                detalles: `usuario_id=${req.params.userId}`
            });
            res.status(200).json({ success: true, message: 'Contraseña actualizada.' });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    // PUT /admin/tenants/:tenantId/users/:userId/email
    static async updateUserEmail(req, res) {
        try {
            const { email } = req.body;
            await TenantUserService.updateEmail(req.params.userId, req.params.tenantId, email);
            await TenantAuditService.log({
                tenantId: req.params.tenantId,
                userId: req.user?.id || null,
                accion: 'actualizar_correo_usuario',
                detalles: `usuario_id=${req.params.userId} correo=${email || 'sin correo'}`
            });
            res.status(200).json({ success: true, message: 'Correo actualizado exitosamente.' });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    // DELETE /admin/tenants/:tenantId/users/:userId
    static async destroyUser(req, res) {
        try {
            await TenantUserService.deleteTenantUser(req.params.userId, req.params.tenantId);
            await TenantAuditService.log({
                tenantId: req.params.tenantId,
                userId: req.user?.id || null,
                accion: 'eliminar_usuario',
                detalles: `usuario_id=${req.params.userId}`
            });
            res.status(200).json({ success: true, message: 'Usuario eliminado permanentemente.' });
        } catch (error) {
            res.status(400).json({ success: false, error: error.message });
        }
    }

    // POST /admin/tenants/:id/seed-categorias
    static async seedCategorias(req, res) {
        try {
            const tenantId = req.params.id;
            const tenant = await TenantService.getTenantById(tenantId);
            if (!tenant) {
                return res.status(404).json({ error: 'Tenant no encontrado' });
            }
            const tipoNegocio =
                tenant.config && tenant.config.tipo_negocio ? tenant.config.tipo_negocio : 'restaurante';
            const result = await CategoryService.seedDefaultCategories(tenantId, tipoNegocio);
            return res.json({ message: 'Categorías creadas', inserted: result.inserted });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // PUT /admin/tenants/:id/facturacion-electronica
    static async updateFacturacionElectronica(req, res) {
        try {
            const FacturacionElectronicaConfigService = require('../../../../services/Tenant/FacturacionElectronicaConfigService');
            const tenantId = Number(req.params.id);
            const config = await FacturacionElectronicaConfigService.save(tenantId, req.body);
            await TenantAuditService.log({
                tenantId,
                userId: req.user?.id || null,
                accion: 'actualizar_config_factus',
                detalles: `ambiente=${config.ambiente}`
            });
            res.status(200).json(config);
        } catch (error) {
            console.error('Error al guardar configuración de facturación electrónica:', error);
            res.status(400).json({ error: error.message });
        }
    }

    // POST /admin/tenants/:id/facturacion-electronica/probar-conexion
    static async testFacturacionElectronica(req, res) {
        try {
            const FacturacionElectronicaConfigService = require('../../../../services/Tenant/FacturacionElectronicaConfigService');
            const tenantId = Number(req.params.id);
            const result = await FacturacionElectronicaConfigService.testConnection(tenantId);
            if (!result.ok) {
                return res.status(400).json(result);
            }
            res.status(200).json(result);
        } catch (error) {
            res.status(400).json({ ok: false, error: error.message });
        }
    }

    // GET /admin/tenants/:id/facturacion-electronica/rangos
    static async getFacturacionElectronicaRangos(req, res) {
        try {
            const FacturacionElectronicaConfigService = require('../../../../services/Tenant/FacturacionElectronicaConfigService');
            const tenantId = Number(req.params.id);
            const rangos = await FacturacionElectronicaConfigService.listNumberingRanges(tenantId);
            res.status(200).json(rangos);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    // PUT /admin/tenants/:id/facturacion-electronica/rango-activo
    static async setFacturacionElectronicaRango(req, res) {
        try {
            const FacturacionElectronicaConfigService = require('../../../../services/Tenant/FacturacionElectronicaConfigService');
            const tenantId = Number(req.params.id);
            await FacturacionElectronicaConfigService.setNumberingRange(tenantId, req.body);
            res.sendStatus(204);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
}

module.exports = TenantsController;
