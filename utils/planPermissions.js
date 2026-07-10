/**
 * Relación entre planes (características/módulos) y permisos.
 * Cada permiso se asocia a un módulo del plan; el tenant solo tiene acceso si su plan incluye ese módulo.
 */

// Módulo del plan requerido para cada permiso (slug de característica en tabla planes)
const PERMISSION_TO_MODULE = {
    'productos.ver': 'productos',
    'productos.crear': 'productos',
    'productos.editar': 'productos',
    'productos.eliminar': 'productos',
    'productos.importar': 'importar_exportar',
    'clientes.ver': 'clientes',
    'clientes.crear': 'clientes',
    'clientes.editar': 'clientes',
    'clientes.eliminar': 'clientes',
    'mesas.ver': 'mesas',
    'mesas.gestionar': 'mesas',
    'mesas.editar': 'mesas',
    'mesas.qr': 'mesas',
    'cocina.ver': 'cocina',
    'cocina.gestionar': 'cocina',
    'ventas.ver': 'ventas',
    'ventas.exportar': 'importar_exportar',
    'facturas.ver': 'ventas',
    'facturas.crear': 'ventas',
    'configuracion.ver': 'configuracion',
    'configuracion.editar': 'configuracion',
    'costeo.ver': 'costeo',
    'costeo.editar': 'costeo',
    'inventario.ver': 'inventario',
    'inventario.editar': 'inventario',
    'recetas.ver': 'recetas',
    'recetas.editar': 'recetas',
    'usuarios.ver': 'configuracion',
    'usuarios.gestionar': 'configuracion',
    'plantillas.ver': 'plantillas',
    'analitica.ver': 'analitica',
    'prediccion.ver': 'prediccion_ml',
    'eventos.ver': 'eventos',
    'eventos.crear': 'eventos',
    'eventos.editar': 'eventos',
    'eventos.eliminar': 'eventos',
    'ventas_evento.realizar': 'eventos',
    'proveedores.ver': 'proveedores',
    'proveedores.editar': 'proveedores',
    'whatsapp.ver': 'configuracion',
    'whatsapp.ajustes': 'configuracion',
    'caja.ver': 'caja',
    'caja.abrir_cerrar': 'caja',
    'caja.movimientos': 'caja',
    'servicios.ver': 'servicios',
    'servicios.crear': 'servicios',
    'servicios.editar': 'servicios',
    'servicios.eliminar': 'servicios',
    'perfil.ver': 'configuracion',
    'perfil.editar': 'configuracion',
    'reporte_mensual.test': 'configuracion',
    'cocina.ver_todo': 'cocina',
    'cocina.ver_listos': 'cocina',
    'pos.ver': 'ventas',
    'pos.vender': 'ventas'
};

// Módulos que se usan en navbar / rutas (para allowedByPlan)
// Básico: dashboard, productos, clientes, mesas, cocina, ventas, configuracion
// Pro: + inventario, recetas | Premium: + eventos, analitica, prediccion_ml
const PLAN_MODULES = [
    'dashboard',
    'productos',
    'clientes',
    'mesas',
    'cocina',
    'ventas',
    'configuracion',
    'inventario',
    'recetas',
    'eventos',
    'analitica',
    'prediccion_ml',
    'plantillas',
    'importar_exportar',
    'costeo',
    'caja',
    'servicios',
    'proveedores'
];

/**
 * Indica si el plan permite un permiso concreto.
 * @param {Object|null} plan - Objeto plan con .caracteristicas (array de strings)
 * @param {string} permission - Ej: 'costeo.ver'
 * @returns {boolean} true si no hay plan (acceso por defecto) o si el plan incluye el módulo del permiso
 */
function planAllowsPermission(plan, permission) {
    if (!plan) {
        return true;
    }
    const isPremium =
        plan.slug === 'premium' ||
        plan.slug === 'definitivo' ||
        (plan.nombre &&
            (plan.nombre.toLowerCase().includes('premium') || plan.nombre.toLowerCase().includes('definitivo')));
    if (isPremium) {
        return true;
    }

    if (!plan.caracteristicas) {
        return true;
    }
    const moduleSlug = PERMISSION_TO_MODULE[permission];
    if (!moduleSlug) {
        return true;
    }
    return Array.isArray(plan.caracteristicas) && plan.caracteristicas.includes(moduleSlug);
}

/**
 * Permisos que otorgan acceso a un módulo (para comprobar "permiso desbloquea plan").
 * @param {string} moduleSlug - Ej: 'analitica', 'eventos'
 * @returns {string[]} Nombres de permisos
 */
function getPermissionNamesForModule(moduleSlug) {
    if (!moduleSlug) {
        return [];
    }
    return Object.keys(PERMISSION_TO_MODULE).filter(p => PERMISSION_TO_MODULE[p] === moduleSlug);
}

// Add-ons cuyo slug en el catálogo (tabla `addons`) no coincide 1:1 con el slug de módulo
// del plan. La mayoría sí coincide (inventario, recetas, costeo, eventos, analitica,
// prediccion_ml); solo 'excel' mapea al módulo 'plantillas' que gatea las rutas de
// importar/exportar Excel.
const ADDON_TO_MODULE = {
    excel: 'plantillas'
};

/**
 * Indica si el plan incluye un módulo (por slug), o si el tenant tiene un add-on que lo
 * desbloquea. Antes solo se miraba plan.caracteristicas: un tenant podía pagar un add-on
 * (tabla tenant_addons) y nunca obtener acceso real, porque nada leía esa tabla acá.
 * @param {Object|null} plan
 * @param {string} moduleSlug - Ej: 'costeo', 'productos'
 * @param {string[]} [addonSlugs] - Slugs de add-ons activos del tenant (tenant_addons)
 * @returns {boolean}
 */
function planHasModule(plan, moduleSlug, addonSlugs = []) {
    if (!plan) {
        return true;
    }
    const isPremium =
        plan.slug === 'premium' ||
        plan.slug === 'definitivo' ||
        (plan.nombre &&
            (plan.nombre.toLowerCase().includes('premium') || plan.nombre.toLowerCase().includes('definitivo')));
    if (isPremium) {
        return true;
    }

    if (!plan.caracteristicas) {
        return true;
    }
    const planIncluye = Array.isArray(plan.caracteristicas) && plan.caracteristicas.includes(moduleSlug);
    if (planIncluye) {
        return true;
    }
    return (addonSlugs || []).some(slug => (ADDON_TO_MODULE[slug] || slug) === moduleSlug);
}

/**
 * Objeto { productos: true, clientes: true, costeo: false, ... } según el plan y los add-ons.
 * @param {Object|null} plan
 * @param {string[]} [addonSlugs]
 * @returns {Object}
 */
function getAllowedByPlan(plan, addonSlugs = []) {
    const out = {};
    PLAN_MODULES.forEach(m => {
        out[m] = planHasModule(plan, m, addonSlugs);
    });
    return out;
}

/**
 * Objeto { productos: true, ... } según plan, add-ons, O permisos del usuario.
 * Si el Superadmin asignó un permiso (ej. inventario.ver) a un usuario de plan Básico,
 * el módulo debe mostrarse en el navbar y permitir acceso.
 * @param {Object|null} plan
 * @param {string[]} userPermissions - permisos del usuario (req.user.permisos)
 * @param {string[]} [addonSlugs]
 * @returns {Object}
 */
function getAllowedForUser(plan, userPermissions, addonSlugs = []) {
    const out = {};
    const permisos = Array.isArray(userPermissions) ? userPermissions : [];
    PLAN_MODULES.forEach(m => {
        const planIncludes = planHasModule(plan, m, addonSlugs);
        const permisosQueDesbloquean = getPermissionNamesForModule(m);
        const userHasPermiso = permisosQueDesbloquean.some(p => permisos.includes(p));
        out[m] = planIncludes || userHasPermiso;
    });
    return out;
}

module.exports = {
    PERMISSION_TO_MODULE,
    PLAN_MODULES,
    ADDON_TO_MODULE,
    planAllowsPermission,
    planHasModule,
    getAllowedByPlan,
    getAllowedForUser,
    getPermissionNamesForModule
};
