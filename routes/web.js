const express = require('express');
const router = express.Router();
const { requireAuth, optionalAuth, restrictSuperadminToAdmin, requirePermission } = require('../middleware/auth');
const { attachTenantContext, costeoTenantContext } = require('../middleware/tenant');
const { requirePlanFeature } = require('../middleware/planFeature');

// Importar controladores base
const HomeController = require('../app/Http/Controllers/HomeController');

// Middlewares comunes
const requireAuthWithTenant = [requireAuth, restrictSuperadminToAdmin, attachTenantContext];

// Importar micro-rutas (Cada una delegada a su Controller)
const authRoutes = require('./auth');
const productosRoutes = require('./tenant/productos');
const clientesRoutes = require('./tenant/clientes');
const facturasRoutes = require('./tenant/facturas');
const mesasRoutes = require('./tenant/mesas');
const cocinaRoutes = require('./tenant/cocina');
const configuracionRoutes = require('./tenant/configuracion');
const ventasRoutes = require('./tenant/ventas');
const dashboardRoutes = require('./tenant/dashboard');
const costeoRoutes = require('./tenant/costeo');
const analiticaRoutes = require('./tenant/analitica');
const adminTenantsRoutes = require('./admin/tenants');
const adminSistemaRoutes = require('./admin/sistema');
const adminPlanesRoutes = require('./admin/planes');
const adminPermisosRoutes = require('./admin/permisos');
const adminVentasRoutes = require('./admin/ventas');
const adminSoporteRoutes = require('./admin/soporte');
const adminDashboardRoutes = require('./admin/dashboard');
const eventosRoutes = require('./tenant/eventos');
const inventarioRoutes = require('./tenant/inventario');
const recetasRoutes = require('./tenant/recetas');
const perfilRoutes = require('./tenant/perfil');
const whatsappRoutes = require('./tenant/whatsapp');
const proveedoresRoutes = require('./tenant/proveedores');
const finanzasRoutes = require('./tenant/finanzas');
const cajaRoutes = require('./tenant/caja');
const serviciosRoutes = require('./tenant/servicios');
const soporteTenantRoutes = require('./tenant/soporte');
const NotificationController = require('../app/Http/Controllers/Tenant/NotificationController');

// ...
router.use('/servicios', requireAuthWithTenant, serviciosRoutes);
router.use('/api/servicios', requireAuthWithTenant, serviciosRoutes);

// --- RUTAS PÚBLICAS Y AUTH ---
router.use('/auth', authRoutes);

// --- RUTA PRINCIPAL (Home & Redirección) ---
router.get('/', optionalAuth, HomeController.index);

// --- RUTAS DE TENANT (RESTAURANTE) ---
router.use('/productos', requireAuthWithTenant, requirePlanFeature('productos'), productosRoutes);
router.use('/perfil', requireAuthWithTenant, perfilRoutes);
router.use('/clientes', requireAuthWithTenant, requirePlanFeature('clientes'), requirePermission('clientes.ver'), clientesRoutes);
router.use('/facturas', requireAuthWithTenant, requirePlanFeature('ventas'), facturasRoutes);
router.use('/mesas', requireAuthWithTenant, requirePlanFeature('mesas'), requirePermission('mesas.ver'), mesasRoutes);
router.use('/cocina', requireAuthWithTenant, requirePlanFeature('cocina'), cocinaRoutes);
router.use('/configuracion', requireAuthWithTenant, requirePlanFeature('configuracion'), configuracionRoutes);
router.use('/ventas', requireAuthWithTenant, requirePlanFeature('ventas'), ventasRoutes);
router.use('/eventos', requireAuthWithTenant, requirePlanFeature('eventos'), eventosRoutes);
router.use('/inventario', requireAuthWithTenant, requirePlanFeature('inventario'), inventarioRoutes);
router.use('/finanzas', requireAuthWithTenant, requirePermission('finanzas.ver'), finanzasRoutes);
router.use('/proveedores', requireAuthWithTenant, requirePlanFeature('inventario'), requirePermission('proveedores.ver'), proveedoresRoutes);
router.use('/recetas', requireAuthWithTenant, requirePlanFeature('recetas'), recetasRoutes);
router.use('/dashboard', requireAuthWithTenant, requirePlanFeature('dashboard'), dashboardRoutes);
router.use('/analitica', requireAuthWithTenant, requirePlanFeature('analitica'), analiticaRoutes);
router.use('/whatsapp', requireAuthWithTenant, requirePlanFeature('configuracion'), requirePermission('whatsapp.ver'), whatsappRoutes);
router.use('/costeo', requireAuth, restrictSuperadminToAdmin, costeoTenantContext, requirePlanFeature('costeo'), costeoRoutes);
router.use('/caja', requireAuthWithTenant, requirePermission('caja.ver'), cajaRoutes);
router.use('/soporte', requireAuthWithTenant, soporteTenantRoutes);

// --- RUTAS API ---
router.use('/api/productos', requireAuthWithTenant, requirePlanFeature('productos'), requirePermission('productos.ver'), productosRoutes);
router.use('/api/clientes', requireAuthWithTenant, requirePlanFeature('clientes'), requirePermission('clientes.ver'), clientesRoutes);
router.use('/api/facturas', requireAuthWithTenant, requirePlanFeature('ventas'), requirePermission('facturas.ver'), facturasRoutes);
router.use('/api/mesas', requireAuthWithTenant, requirePlanFeature('mesas'), requirePermission('mesas.ver'), mesasRoutes);
router.use('/api/cocina', requireAuthWithTenant, requirePlanFeature('cocina'), requirePermission('cocina.ver'), cocinaRoutes);
router.use('/api/dashboard', requireAuthWithTenant, requirePlanFeature('dashboard'), dashboardRoutes);

// --- RUTA DE NOTIFICACIONES (SSE) ---
router.get('/api/notifications/subscribe', requireAuthWithTenant, NotificationController.subscribe);

// --- RUTAS DE SUPERADMIN ---
router.use('/admin/dashboard', requireAuth, adminDashboardRoutes);
router.use('/admin/tenants', requireAuth, adminTenantsRoutes);
router.use('/admin/sistema', requireAuth, adminSistemaRoutes);
router.use('/admin/planes', requireAuth, adminPlanesRoutes);
router.use('/admin/permisos', requireAuth, adminPermisosRoutes);
router.use('/admin/ventas', requireAuth, adminVentasRoutes);
router.use('/admin/soporte', requireAuth, adminSoporteRoutes);

module.exports = router;
