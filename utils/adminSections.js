// Estructura del sidebar del panel superadmin.
// Única fuente de verdad para el menú lateral y la grilla de "Accesos rápidos",
// para que ambos no puedan desincronizarse (mismo patrón que PERMISSION_SECTIONS).

const ADMIN_SECTIONS = [
    {
        key: 'inicio',
        label: 'Inicio',
        icon: 'bi-house-door',
        collapsible: false,
        items: [{ key: 'dashboard', label: 'Dashboard', icon: 'bi-speedometer2', href: '/admin/dashboard' }]
    },
    {
        key: 'comercio',
        label: 'Comercio',
        icon: 'bi-shop',
        collapsible: true,
        items: [
            { key: 'tenants', label: 'Restaurantes', icon: 'bi-building', href: '/admin/tenants' },
            { key: 'sucursales', label: 'Sucursales', icon: 'bi-diagram-3', href: '/admin/sucursales' },
            { key: 'productos', label: 'Catálogo de Productos', icon: 'bi-box-seam', href: '/admin/productos' },
            {
                key: 'onboarding',
                label: 'Onboarding',
                icon: 'bi-person-check',
                href: '/admin/onboarding',
                badgeKey: 'onboardingPendientes'
            },
            { key: 'planes', label: 'Planes & Add-ons', icon: 'bi-layers', href: '/admin/planes' },
            { key: 'landing', label: 'Landing Page', icon: 'bi-palette', href: '/admin/landing' }
        ]
    },
    {
        key: 'usuarios',
        label: 'Usuarios y accesos',
        icon: 'bi-people',
        collapsible: true,
        items: [
            { key: 'permisos', label: 'Permisos por usuario', icon: 'bi-shield-lock', href: '/admin/permisos' },
            {
                key: 'permisos-masivo',
                label: 'Permisos masivos y roles',
                icon: 'bi-people-fill',
                href: '/admin/permisos/masivo'
            }
        ]
    },
    {
        key: 'operacion',
        label: 'Operación y datos',
        icon: 'bi-graph-up',
        collapsible: true,
        items: [
            {
                key: 'rendimiento',
                label: 'Panel de rendimiento',
                icon: 'bi-graph-up-arrow',
                href: '/admin/rendimiento'
            },
            {
                key: 'reportes',
                label: 'Reportes consolidados',
                icon: 'bi-file-earmark-bar-graph',
                href: '/admin/reportes'
            },
            { key: 'ventas', label: 'Eliminar ventas', icon: 'bi-trash3', href: '/admin/ventas' }
        ]
    },
    {
        key: 'comunicacion',
        label: 'Comunicación',
        icon: 'bi-headset',
        collapsible: true,
        items: [
            { key: 'anuncios', label: 'Anuncios', icon: 'bi-megaphone', href: '/admin/anuncios' },
            {
                key: 'soporte',
                label: 'Soporte técnico',
                icon: 'bi-headset',
                href: '/admin/soporte',
                badgeKey: 'soporteAbiertos'
            }
        ]
    },
    {
        key: 'sistema',
        label: 'Sistema',
        icon: 'bi-gear-wide-connected',
        collapsible: true,
        items: [{ key: 'sistema', label: 'Temas y parámetros', icon: 'bi-gear-wide-connected', href: '/admin/sistema' }]
    }
];

// Vista aplanada de todos los ítems, reutilizada por la grilla de "Accesos rápidos"
// para que nunca quede desactualizada respecto al sidebar (bug que tenía _footer_details.ejs).
const ADMIN_QUICK_LINKS = ADMIN_SECTIONS.flatMap(section => section.items);

module.exports = { ADMIN_SECTIONS, ADMIN_QUICK_LINKS };
