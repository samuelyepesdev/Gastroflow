const express = require('express');
const router = express.Router();
const {
    requireAuth,
    optionalAuth,
    restrictSuperadminToAdmin,
    requirePermission,
    requirePermissionByMethod,
    requireRole
} = require('../middleware/auth');
const { attachTenantContext, costeoTenantContext } = require('../middleware/tenant');
const { requirePlanFeature } = require('../middleware/planFeature');
const adminLocals = require('../middleware/adminLocals');
const { ROLES } = require('../utils/constants');

// Importar controladores base
const HomeController = require('../app/Http/Controllers/HomeController');
const DesktopController = require('../app/Http/Controllers/DesktopController');

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
const adminProductosRoutes = require('./admin/productos');
const adminSoporteRoutes = require('./admin/soporte');
const adminDashboardRoutes = require('./admin/dashboard');
const adminReportesRoutes = require('./admin/reportes');
const adminRendimientoRoutes = require('./admin/rendimiento');
const adminJobsRoutes = require('./admin/jobs');
const adminLandingRoutes = require('./admin/landing');
const LandingSettingsService = require('../services/Admin/LandingSettingsService');
const eventosRoutes = require('./tenant/eventos');
const inventarioRoutes = require('./tenant/inventario');
const recetasRoutes = require('./tenant/recetas');
const modificadoresRoutes = require('./tenant/modificadores');
const perfilRoutes = require('./tenant/perfil');
const facturacionRoutes = require('./tenant/facturacion');
const proveedoresRoutes = require('./tenant/proveedores');
const ordenesCompraRoutes = require('./tenant/ordenes_compra');
const estacionesRoutes = require('./tenant/estaciones');
const finanzasRoutes = require('./tenant/finanzas');
const cajaRoutes = require('./tenant/caja');
const serviciosRoutes = require('./tenant/servicios');
const soporteTenantRoutes = require('./tenant/soporte');
const posRoutes = require('./tenant/pos');
const clasificacionRoutes = require('./tenant/clasificacion');
const syncRoutes = require('./tenant/sync');
const bonosRoutes = require('./tenant/bonos');
const BonosController = require('../app/Http/Controllers/Tenant/BonosController');
const promocionesRoutes = require('./tenant/promociones');
const combosRoutes = require('./tenant/combos');
const onboardingRoutes = require('./onboarding');
const adminOnboardingRoutes = require('./admin/onboarding');
const NotificationController = require('../app/Http/Controllers/Tenant/NotificationController');

// ...
router.use('/servicios', requireAuthWithTenant, serviciosRoutes);
router.use('/api/servicios', requireAuthWithTenant, serviciosRoutes);

// --- RUTAS PÚBLICAS Y AUTH ---
router.use('/auth', authRoutes);
// Onboarding: crear el local (usuario ya verificado, sin tenant todavía).
// Guard propio (requireAuth + requireOnboarding) en routes/onboarding.js;
// no usa requireAuthWithTenant a propósito (attachTenantContext haría fallback
// al tenant por defecto si tenant_id es null).
router.use('/onboarding', onboardingRoutes);
// Vinculación inicial del desktop con producción (ver DesktopController). Sin
// auth porque corre antes de que exista ningún usuario local; en producción
// normal ambas rutas redirigen a /auth/login sin hacer nada (isDesktopMode()
// es false ahí).
router.get('/desktop/link', DesktopController.showLink);
router.post('/desktop/link', DesktopController.link);
router.use('/qr', require('./qr'));
router.use('/api/qr', require('./qr_api'));
// Página pública del bono (la abre el QR del comprobante): sin login, acotada por token.
router.use('/bono', require('./bono_publico'));
// Webhook público de Wompi (cobro de suscripciones) -- se autentica por firma, no por sesión.
router.use('/webhooks', require('./webhooks'));

// --- RUTA PRINCIPAL (Home & Redirección) ---
router.get('/', optionalAuth, HomeController.index);

// --- RUTAS LEGALES (públicas) ---
router.get('/legal/privacidad', async (req, res) => {
    try {
        const settings = await LandingSettingsService.getAll();
        res.render('legal/privacidad', { settings });
    } catch (error) {
        console.error('Error fetching landing settings for privacy policy:', error);
        res.render('legal/privacidad', { settings: {} });
    }
});
router.get('/legal/terminos', async (req, res) => {
    try {
        const settings = await LandingSettingsService.getAll();
        res.render('legal/terminos', { settings });
    } catch (error) {
        console.error('Error fetching landing settings for terms:', error);
        res.render('legal/terminos', { settings: {} });
    }
});
router.get('/legal/cookies', async (req, res) => {
    try {
        const settings = await LandingSettingsService.getAll();
        res.render('legal/cookies', { settings });
    } catch (error) {
        console.error('Error fetching landing settings for cookies policy:', error);
        res.render('legal/cookies', { settings: {} });
    }
});
router.get('/legal/reembolsos', async (req, res) => {
    try {
        const settings = await LandingSettingsService.getAll();
        res.render('legal/reembolsos', { settings });
    } catch (error) {
        console.error('Error fetching landing settings for refund policy:', error);
        res.render('legal/reembolsos', { settings: {} });
    }
});

// --- RUTAS DE TENANT (RESTAURANTE) ---
router.use('/productos', requireAuthWithTenant, requirePlanFeature('productos'), productosRoutes);
router.use('/perfil', requireAuthWithTenant, perfilRoutes);
router.use('/facturacion', requireAuthWithTenant, facturacionRoutes);
router.use(
    '/clientes',
    requireAuthWithTenant,
    requirePlanFeature('clientes'),
    requirePermission('clientes.ver'),
    clientesRoutes
);
router.use('/facturas', requireAuthWithTenant, requirePlanFeature('ventas'), facturasRoutes);
router.use('/mesas', requireAuthWithTenant, requirePlanFeature('mesas'), requirePermission('mesas.ver'), mesasRoutes);
router.use(
    '/cocina',
    requireAuthWithTenant,
    requirePlanFeature('cocina'),
    requirePermission('cocina.ver'),
    cocinaRoutes
);
router.use('/estaciones', requireAuthWithTenant, requirePlanFeature('cocina'), estacionesRoutes);
router.use('/configuracion', requireAuthWithTenant, requirePlanFeature('configuracion'), configuracionRoutes);
router.use('/ventas', requireAuthWithTenant, requirePlanFeature('ventas'), ventasRoutes);
router.use('/eventos', requireAuthWithTenant, requirePlanFeature('eventos'), eventosRoutes);
// Lecturas: inventario.ver (o los módulos que consumen /inventario/api/insumos: recetas y compras).
// Las escrituras ya llevan inventario.editar en el propio router.
router.use(
    '/inventario',
    requireAuthWithTenant,
    requirePlanFeature('inventario'),
    requirePermissionByMethod({
        ver: [
            'inventario.ver',
            'inventario.editar',
            'recetas.ver',
            'recetas.editar',
            'proveedores.ver',
            'proveedores.ordenes'
        ]
    }),
    inventarioRoutes
);
router.use('/finanzas', requireAuthWithTenant, requirePermission('finanzas.ver'), finanzasRoutes);
router.use(
    '/proveedores',
    requireAuthWithTenant,
    requirePlanFeature('inventario'),
    requirePermission('proveedores.ver'),
    proveedoresRoutes
);
router.use(
    '/ordenes-compra',
    requireAuthWithTenant,
    requirePlanFeature('inventario'),
    requirePermission('proveedores.ordenes'),
    ordenesCompraRoutes
);
// Lecturas: recetas.ver; las escrituras ya llevan recetas.editar en el propio router.
router.use(
    '/recetas',
    requireAuthWithTenant,
    requirePlanFeature('recetas'),
    requirePermissionByMethod({ ver: ['recetas.ver', 'recetas.editar'] }),
    recetasRoutes
);
router.use(
    '/modificadores',
    requireAuthWithTenant,
    requirePlanFeature('productos'),
    requirePermission('modificadores.ver'),
    modificadoresRoutes
);
router.use('/dashboard', requireAuthWithTenant, requirePlanFeature('dashboard'), dashboardRoutes);
router.use('/analitica', requireAuthWithTenant, requirePlanFeature('analitica'), analiticaRoutes);
router.use('/clasificacion', requireAuthWithTenant, requirePermission('clasificacion.ver'), clasificacionRoutes);
router.use(
    '/costeo',
    requireAuth,
    restrictSuperadminToAdmin,
    costeoTenantContext,
    requirePlanFeature('costeo'),
    // costeo.ver para leer, costeo.editar para crear/modificar/borrar (el superadmin pasa siempre).
    // La pantalla de productos ya tolera el 403 de costeo y oculta esa sección.
    requirePermissionByMethod({ ver: ['costeo.ver', 'costeo.editar'], editar: ['costeo.editar'] }),
    costeoRoutes
);
router.use('/caja', requireAuthWithTenant, requirePermission('caja.ver'), cajaRoutes);
router.use('/bonos', requireAuthWithTenant, bonosRoutes);
// Consulta liviana de saldo por código, usada desde el checkout de Mesas/POS al
// redimir: solo requiere estar autenticado en el tenant (no bonos.ver/gestionar),
// igual que cualquiera que pueda facturar ya puede registrar un abono.
router.get('/api/bonos/validar/:codigo', requireAuthWithTenant, BonosController.validar);
router.use('/promociones', requireAuthWithTenant, promocionesRoutes);
router.use('/combos', requireAuthWithTenant, combosRoutes);
router.use('/soporte', requireAuthWithTenant, soporteTenantRoutes);
router.use('/pos', requireAuthWithTenant, requirePlanFeature('ventas'), requirePermission('pos.ver'), posRoutes);
// Sync desktop <-> producción: sin requirePlanFeature/requirePermission propios.
// Las acciones que hoy despacha el push (abrir pedido, agregar/editar items,
// propina) son las mismas que en /mesas ya son de libre acceso para cualquier
// usuario autenticado del tenant (sin requirePermission en esas rutas). Si se
// agregan acciones que sí requieren un permiso específico, ese chequeo debe
// añadirse en SyncService antes de despachar, no asumirse aquí.
// Solo admin: el pull incluye password_hash de los usuarios del tenant (login local del desktop)
// y el push muta pedidos; el terminal se vincula con la cuenta del dueño/admin.
router.use('/sync', requireAuthWithTenant, requireRole('admin'), syncRoutes);

// --- RUTAS API ---
router.use(
    '/api/productos',
    requireAuthWithTenant,
    requirePlanFeature('productos'),
    requirePermission('productos.ver'),
    productosRoutes
);
router.use(
    '/api/clientes',
    requireAuthWithTenant,
    requirePlanFeature('clientes'),
    requirePermission('clientes.ver'),
    clientesRoutes
);
router.use(
    '/api/facturas',
    requireAuthWithTenant,
    requirePlanFeature('ventas'),
    requirePermission('facturas.ver'),
    facturasRoutes
);
router.use(
    '/api/mesas',
    requireAuthWithTenant,
    requirePlanFeature('mesas'),
    requirePermission('mesas.ver'),
    mesasRoutes
);
router.use(
    '/api/cocina',
    requireAuthWithTenant,
    requirePlanFeature('cocina'),
    requirePermission('cocina.ver'),
    cocinaRoutes
);
router.use('/api/dashboard', requireAuthWithTenant, requirePlanFeature('dashboard'), dashboardRoutes);

// --- RUTA DE NOTIFICACIONES (SSE) ---
router.get('/api/notifications/subscribe', requireAuthWithTenant, NotificationController.subscribe);

// --- RUTAS DE SUPERADMIN ---
const requireSuperadmin = [requireAuth, requireRole(ROLES.SUPERADMIN), adminLocals];
router.use('/admin/dashboard', requireSuperadmin, adminDashboardRoutes);
router.use('/admin/tenants', requireSuperadmin, adminTenantsRoutes);
router.use('/admin/onboarding', requireSuperadmin, adminOnboardingRoutes);
router.use('/admin/sistema', requireSuperadmin, adminSistemaRoutes);
router.use('/admin/planes', requireSuperadmin, adminPlanesRoutes);
router.use('/admin/permisos', requireSuperadmin, adminPermisosRoutes);
router.use('/admin/ventas', requireSuperadmin, adminVentasRoutes);
router.use('/admin/productos', requireSuperadmin, adminProductosRoutes);
router.use('/admin/soporte', requireSuperadmin, adminSoporteRoutes);
router.use('/admin/reportes', requireSuperadmin, adminReportesRoutes);
router.use('/admin/rendimiento', requireSuperadmin, adminRendimientoRoutes);
router.use('/admin/jobs', requireSuperadmin, adminJobsRoutes);
router.use('/admin/landing', requireSuperadmin, adminLandingRoutes);

module.exports = router;
