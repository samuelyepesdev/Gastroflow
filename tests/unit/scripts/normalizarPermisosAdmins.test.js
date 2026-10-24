/**
 * Heurística que decide si la foto de permisos de un admin era solo su plan (se limpia) o un
 * ajuste manual (se conserva). Los ids de permisos crecen con el tiempo.
 */
jest.mock('../../../config/database', () => ({ query: jest.fn() }));

const { esSnapshotDePlan } = require('../../../scripts/normalizar-permisos-admins');

describe('esSnapshotDePlan', () => {
    const plan = [1, 2, 3, 5, 8, 9];

    test('la foto exacta del plan es de plan', () => {
        expect(esSnapshotDePlan([1, 2, 3, 5, 8, 9], plan)).toBe(true);
    });

    test('una foto vieja que no tiene los permisos creados después sigue siendo de plan', () => {
        expect(esSnapshotDePlan([1, 2, 3, 5], plan)).toBe(true);
    });

    test('un permiso de más fuera del plan es un ajuste manual (desbloqueo)', () => {
        expect(esSnapshotDePlan([1, 2, 3, 5, 8, 9, 20], plan)).toBe(false);
        expect(esSnapshotDePlan([1, 2, 4], plan)).toBe(false);
    });

    test('un permiso de menos dentro del plan es un ajuste manual (restricción)', () => {
        expect(esSnapshotDePlan([1, 3, 5, 8, 9], plan)).toBe(false);
        expect(esSnapshotDePlan([1, 2, 3, 8, 9], plan)).toBe(false);
    });

    test('una foto vacía no se considera de plan', () => {
        expect(esSnapshotDePlan([], plan)).toBe(false);
    });

    test('con un plan sin permisos, cualquier foto es manual', () => {
        expect(esSnapshotDePlan([1, 2], [])).toBe(false);
    });
});
