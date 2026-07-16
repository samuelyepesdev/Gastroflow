const express = require('express');
const router = express.Router();
const TenantsController = require('../../app/Http/Controllers/Admin/TenantsController');
const { ROLES } = require('../../utils/constants');
const authService = require('../../services/Shared/AuthService');
const BaseRequest = require('../../app/Http/Requests/BaseRequest');
const StoreTenantRequest = require('../../app/Http/Requests/Admin/StoreTenantRequest');
const UpdateTenantRequest = require('../../app/Http/Requests/Admin/UpdateTenantRequest');

// Middleware de seguridad para el módulo admin
router.use((req, res, next) => {
    if (!req.user) {
        return res.redirect('/auth/login');
    }
    if (!authService.hasRole(req.user.rol, [ROLES.SUPERADMIN])) {
        return res.redirect('/');
    }
    next();
});

// Tenants list & creation
router.get('/', TenantsController.index);
router.post('/', BaseRequest.validate(StoreTenantRequest), TenantsController.store);
router.put('/:id', BaseRequest.validate(UpdateTenantRequest), TenantsController.update);
router.delete('/:id', TenantsController.destroy);
router.post('/:id/status', TenantsController.updateStatus);
router.post('/:id/seed-categorias', TenantsController.seedCategorias);

// Facturación electrónica (Factus) — configuración fiscal por tenant
router.put('/:id/facturacion-electronica', TenantsController.updateFacturacionElectronica);
router.put('/:id/facturacion-electronica/estado', TenantsController.updateFacturacionElectronicaEstado);
router.post('/:id/facturacion-electronica/probar-conexion', TenantsController.testFacturacionElectronica);
router.get('/:id/facturacion-electronica/rangos', TenantsController.getFacturacionElectronicaRangos);
router.put('/:id/facturacion-electronica/rango-activo', TenantsController.setFacturacionElectronicaRango);

// Tenant Users management
router.post('/:id/users', TenantsController.storeUser);
router.post('/:tenantId/users/batch-roles', TenantsController.batchUpdateRoles);
router.patch('/:tenantId/users/:userId/roles', TenantsController.updateUserRole);
router.post('/:tenantId/users/:userId/status', TenantsController.updateUserStatus);
router.put('/:tenantId/users/:userId/password', TenantsController.updateUserPassword);
router.put('/:tenantId/users/:userId/email', TenantsController.updateUserEmail);
router.delete('/:tenantId/users/:userId', TenantsController.destroyUser);

module.exports = router;
