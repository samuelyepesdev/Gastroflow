/**
 * navbarLocals.js
 * Middleware que define res.locals.nav como un getter lazy.
 * Se evalúa solo cuando EJS accede a `nav` — es decir, DESPUÉS de que
 * attachTenantContext y requirePlanFeature ya hayan corrido.
 * Así allowedByPlan, req.user y req.tenant están disponibles.
 */

module.exports = function navbarLocals(req, res, next) {
    Object.defineProperty(res.locals, 'nav', {
        configurable: true,
        enumerable: true,
        get: function () {
            const user = req.user || null;
            const tenant = req.tenant || res.locals.tenant || null;
            const ap = res.locals.allowedByPlan || {};

            const cs = mod => !mod || ap[mod] === true;
            const hp = p =>
                !!(
                    user &&
                    (String(user.rol || '').toLowerCase() === 'superadmin' ||
                        (Array.isArray(user.permisos) && user.permisos.includes(p)))
                );

            const isSuperadmin = !!(user && String(user.rol || '').toLowerCase() === 'superadmin');

            let brandName = tenant ? tenant.nombre : 'Sistema';
            const words = brandName.split(' ');
            if (brandName.length > 18 && words.length > 1) {
                brandName = words.slice(0, 2).join(' ');
            }

            const fullName = user ? user.nombre_completo || user.username || '' : '';
            const userInitial = fullName ? fullName.charAt(0).toUpperCase() : '?';
            const userFirstName = fullName.split(' ')[0] || '';

            const can = {
                dashboard: !!(user && user.rol === 'admin' && cs('dashboard')),
                mesas: hp('mesas.ver') && cs('mesas'),
                ventas: hp('ventas.ver') && cs('ventas'),
                cocina: hp('cocina.ver') && cs('cocina'),
                productos: hp('productos.ver') && cs('productos'),
                clientes: hp('clientes.ver') && cs('clientes'),
                inventario: hp('inventario.ver') && cs('inventario'),
                recetas: hp('recetas.ver') && cs('recetas'),
                eventos: hp('eventos.ver') && cs('eventos'),
                analitica: hp('analitica.ver') && cs('analitica'),
                configuracion: hp('configuracion.ver') && cs('configuracion'),
                perfil: hp('perfil.ver'),
                whatsapp: hp('whatsapp.ver') && cs('configuracion'),
                whatsappAjustes: hp('whatsapp.ajustes') && cs('configuracion'),
                proveedores: hp('proveedores.ver') && cs('proveedores'),
                caja: hp('caja.ver') && cs('caja'),
                finanzas: hp('finanzas.ver'),
                servicios: hp('servicios.ver') && cs('servicios'),
                pos: hp('pos.ver') && cs('ventas')
            };

            const hasMas =
                can.recetas || can.eventos || can.analitica || can.whatsapp || can.proveedores || can.servicios;

            let primaryColor = '#6366f1';
            let bgStart = '#1e3a5f';
            let bgEnd = '#0f172a';
            let textColor = '#ffffff';

            let cardPrimary = '';
            let cardSecondary = '';

            if (tenant && tenant.config) {
                const cfg = typeof tenant.config === 'string' ? JSON.parse(tenant.config) : tenant.config;
                if (cfg.colores) {
                    if (cfg.colores.primary) {
                        primaryColor = cfg.colores.primary;
                    }
                    if (cfg.colores.navbar) {
                        bgStart = cfg.colores.navbar;
                        bgEnd = cfg.colores.navbar;
                    }
                    if (cfg.colores.navbarText) {
                        textColor = cfg.colores.navbarText;
                    }
                    if (cfg.colores.cardPrimary) {
                        cardPrimary = cfg.colores.cardPrimary;
                    }
                    if (cfg.colores.cardSecondary) {
                        cardSecondary = cfg.colores.cardSecondary;
                    }
                }
            }

            return {
                isSuperadmin,
                brandHref: isSuperadmin ? '/admin/dashboard' : '/',
                brandName,
                tenantNombre: tenant ? tenant.nombre : 'Sistema',
                userInitial,
                userFirstName,
                primaryColor,
                bgStart,
                bgEnd,
                textColor,
                cardPrimary,
                cardSecondary,
                can,
                hasMas
            };
        }
    });

    next();
};
