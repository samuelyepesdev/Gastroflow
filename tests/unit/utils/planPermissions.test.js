/**
 * Tests unitarios para utils/planPermissions.js
 */

const {
    PERMISSION_TO_MODULE,
    PLAN_MODULES,
    planAllowsPermission,
    planHasModule,
    getAllowedByPlan,
    getPermissionNamesForModule
} = require('../../../utils/planPermissions');

describe('planPermissions', () => {
    describe('PERMISSION_TO_MODULE', () => {
        it('mapea permisos de productos al módulo productos', () => {
            expect(PERMISSION_TO_MODULE['productos.ver']).toBe('productos');
            expect(PERMISSION_TO_MODULE['productos.crear']).toBe('productos');
            expect(PERMISSION_TO_MODULE['productos.editar']).toBe('productos');
        });
        it('mapea costeo.ver a costeo', () => {
            expect(PERMISSION_TO_MODULE['costeo.ver']).toBe('costeo');
        });
        it('mapea eventos.ver y eventos.crear a eventos', () => {
            expect(PERMISSION_TO_MODULE['eventos.ver']).toBe('eventos');
            expect(PERMISSION_TO_MODULE['eventos.crear']).toBe('eventos');
        });
    });

    describe('PLAN_MODULES', () => {
        it('incluye los módulos esperados', () => {
            expect(PLAN_MODULES).toContain('productos');
            expect(PLAN_MODULES).toContain('clientes');
            expect(PLAN_MODULES).toContain('costeo');
            expect(PLAN_MODULES).toContain('analitica');
            expect(PLAN_MODULES).toContain('eventos');
        });
    });

    describe('planAllowsPermission', () => {
        it('devuelve true si plan es null', () => {
            expect(planAllowsPermission(null, 'costeo.ver')).toBe(true);
        });
        it('devuelve true si plan no tiene caracteristicas', () => {
            expect(planAllowsPermission({}, 'costeo.ver')).toBe(true);
            expect(planAllowsPermission({ caracteristicas: null }, 'costeo.ver')).toBe(true);
        });
        it('devuelve true si el permiso no está mapeado', () => {
            expect(planAllowsPermission({ caracteristicas: [] }, 'permiso.inexistente')).toBe(true);
        });
        it('devuelve false si el plan no incluye el módulo del permiso', () => {
            expect(planAllowsPermission({ caracteristicas: ['productos', 'clientes'] }, 'costeo.ver')).toBe(false);
        });
        it('devuelve true si el plan incluye el módulo del permiso', () => {
            expect(planAllowsPermission({ caracteristicas: ['productos', 'costeo'] }, 'costeo.ver')).toBe(true);
        });
    });

    describe('getPermissionNamesForModule', () => {
        it('devuelve [] si moduleSlug es vacío/null', () => {
            expect(getPermissionNamesForModule('')).toEqual([]);
            expect(getPermissionNamesForModule(null)).toEqual([]);
        });
        it('devuelve los permisos que corresponden al módulo', () => {
            const permisos = getPermissionNamesForModule('costeo');
            expect(permisos).toContain('costeo.ver');
            expect(permisos).toContain('costeo.editar');
        });
        it('para analitica devuelve analitica.ver', () => {
            const permisos = getPermissionNamesForModule('analitica');
            expect(permisos).toContain('analitica.ver');
        });
    });

    describe('planHasModule', () => {
        it('devuelve true si plan es null o sin caracteristicas', () => {
            expect(planHasModule(null, 'costeo')).toBe(true);
            expect(planHasModule({}, 'costeo')).toBe(true);
        });
        it('devuelve false si el plan no incluye el módulo', () => {
            expect(planHasModule({ caracteristicas: ['productos'] }, 'costeo')).toBe(false);
        });
        it('devuelve true si el plan incluye el módulo', () => {
            expect(planHasModule({ caracteristicas: ['productos', 'costeo'] }, 'costeo')).toBe(true);
        });

        describe('BUG REGRESIÓN: un add-on pagado (tenant_addons) debe desbloquear el módulo', () => {
            it('antes: un tenant con addon "costeo" pero sin el módulo en su plan quedaba bloqueado igual', () => {
                // Comportamiento previo (sin addonSlugs) — el plan manda solo
                expect(planHasModule({ caracteristicas: ['productos'] }, 'costeo')).toBe(false);
            });

            it('ahora: el addonSlug del tenant desbloquea el módulo aunque el plan no lo incluya', () => {
                expect(planHasModule({ caracteristicas: ['productos'] }, 'costeo', ['costeo'])).toBe(true);
            });

            it('addon irrelevante no desbloquea otros módulos', () => {
                expect(planHasModule({ caracteristicas: ['productos'] }, 'costeo', ['eventos'])).toBe(false);
            });

            it('mapea el addon "excel" al módulo "plantillas" (slugs distintos en catálogo vs plan)', () => {
                expect(planHasModule({ caracteristicas: ['productos'] }, 'plantillas', ['excel'])).toBe(true);
            });

            it('si el plan ya incluye el módulo, no depende de addonSlugs', () => {
                expect(planHasModule({ caracteristicas: ['costeo'] }, 'costeo', [])).toBe(true);
            });
        });
    });

    describe('getAllowedByPlan', () => {
        it('devuelve objeto con todos los módulos de PLAN_MODULES', () => {
            const out = getAllowedByPlan(null);
            PLAN_MODULES.forEach(m => {
                expect(out).toHaveProperty(m);
                expect(typeof out[m]).toBe('boolean');
            });
        });
        it('con plan null todos los módulos están permitidos', () => {
            const out = getAllowedByPlan(null);
            PLAN_MODULES.forEach(m => expect(out[m]).toBe(true));
        });
        it('con plan con caracteristicas solo permite los incluidos', () => {
            const plan = { caracteristicas: ['productos', 'clientes'] };
            const out = getAllowedByPlan(plan);
            expect(out.productos).toBe(true);
            expect(out.clientes).toBe(true);
            expect(out.costeo).toBe(false);
            expect(out.analitica).toBe(false);
        });
        it('un add-on habilita su módulo aunque el plan no lo incluya', () => {
            const plan = { caracteristicas: ['productos', 'clientes'] };
            const out = getAllowedByPlan(plan, ['costeo', 'analitica']);
            expect(out.costeo).toBe(true);
            expect(out.analitica).toBe(true);
            expect(out.eventos).toBe(false);
        });
    });
});
