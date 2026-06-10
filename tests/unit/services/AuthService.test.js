/**
 * Tests unitarios para AuthService (solo funciones puras: hasRole, hasPermission)
 */

const AuthService = require('../../../services/Shared/AuthService');

describe('AuthService (hasRole, hasPermission)', () => {
    describe('hasPermission', () => {
        it('devuelve false si userPermissions no es array', () => {
            expect(AuthService.hasPermission(null, 'productos.ver')).toBe(false);
            expect(AuthService.hasPermission(undefined, 'productos.ver')).toBe(false);
            expect(AuthService.hasPermission('string', 'productos.ver')).toBe(false);
        });
        it('devuelve false si el permiso no está en la lista', () => {
            expect(AuthService.hasPermission(['productos.ver'], 'productos.editar')).toBe(false);
            expect(AuthService.hasPermission([], 'productos.ver')).toBe(false);
        });
        it('devuelve true si el permiso está en la lista', () => {
            expect(AuthService.hasPermission(['productos.ver', 'productos.editar'], 'productos.editar')).toBe(true);
            expect(AuthService.hasPermission(['costeo.ver'], 'costeo.ver')).toBe(true);
        });
    });

    describe('hasRole', () => {
        it('devuelve false si userRole es vacío', () => {
            expect(AuthService.hasRole('', ['admin'])).toBe(false);
            expect(AuthService.hasRole(null, ['admin'])).toBe(false);
        });
        it('devuelve false si requiredRoles no es array', () => {
            expect(AuthService.hasRole('admin', null)).toBe(false);
            expect(AuthService.hasRole('admin', 'admin')).toBe(false);
        });
        it('devuelve true si el rol coincide (case insensitive)', () => {
            expect(AuthService.hasRole('admin', ['admin'])).toBe(true);
            expect(AuthService.hasRole('ADMIN', ['admin'])).toBe(true);
            expect(AuthService.hasRole('Admin', ['admin', 'vendedor'])).toBe(true);
        });
        it('devuelve true si tiene uno de los roles requeridos', () => {
            expect(AuthService.hasRole('vendedor', ['admin', 'vendedor'])).toBe(true);
        });
        it('devuelve false si no tiene ninguno de los roles', () => {
            expect(AuthService.hasRole('otro', ['admin', 'vendedor'])).toBe(false);
        });
    });
});
