/**
 * Relación entre planes (características/módulos) y permisos.
 * Cada permiso se asocia a un módulo del plan; el tenant solo tiene acceso si su plan incluye ese módulo.
 */

// Módulo del plan requerido para cada permiso (slug de característica en tabla planes).
// Se deriva de utils/permisosCatalogo.js, donde se declara cada permiso.
const { PERMISSION_TO_MODULE } = require('./permisosCatalogo');

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

// Valor especial de `planes.caracteristicas`: el plan incluye TODOS los módulos, también los que se
// agreguen después. Así un plan "completo" no hay que actualizarlo cada vez que sale un módulo nuevo.
const TODOS_LOS_MODULOS = '*';

// Etiquetas legibles para cada slug de módulo — usadas por el editor de características
// (admin/planes) y por el comparador de planes del navbar del tenant.
const MODULE_LABELS = {
    dashboard: 'Dashboard',
    productos: 'Productos',
    clientes: 'Clientes',
    mesas: 'Mesas',
    cocina: 'Cocina',
    ventas: 'Ventas',
    configuracion: 'Configuración',
    inventario: 'Inventario',
    recetas: 'Recetas y costeo de platos',
    eventos: 'Eventos',
    analitica: 'Analítica avanzada',
    prediccion_ml: 'Predicción con IA',
    plantillas: 'Plantillas',
    importar_exportar: 'Importar/Exportar',
    costeo: 'Costeo',
    caja: 'Caja registradora',
    servicios: 'Servicios',
    proveedores: 'Proveedores',
    [TODOS_LOS_MODULOS]: 'Todos los módulos (incluidos los nuevos)'
};

/** ¿El plan está marcado como "incluye todos los módulos"? */
function incluyeTodosLosModulos(plan) {
    return !!plan && Array.isArray(plan.caracteristicas) && plan.caracteristicas.includes(TODOS_LOS_MODULOS);
}

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
    if (!moduleSlug || incluyeTodosLosModulos(plan)) {
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
    const planIncluye =
        incluyeTodosLosModulos(plan) ||
        (Array.isArray(plan.caracteristicas) && plan.caracteristicas.includes(moduleSlug));
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
    TODOS_LOS_MODULOS,
    incluyeTodosLosModulos,
    PERMISSION_TO_MODULE,
    PLAN_MODULES,
    MODULE_LABELS,
    ADDON_TO_MODULE,
    planAllowsPermission,
    planHasModule,
    getAllowedByPlan,
    getAllowedForUser,
    getPermissionNamesForModule
};
