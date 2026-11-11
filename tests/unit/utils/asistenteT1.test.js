const fs = require('fs');
const path = require('path');
const { PERMISOS_CATALOGO, PERMISSION_TO_MODULE } = require('../../../utils/permisosCatalogo');
const { PLAN_MODULES, MODULE_LABELS } = require('../../../utils/planPermissions');

describe('asistente Chef (T1)', () => {
    test('asistente.usar existe, depende del módulo asistente y no se concede a ningún rol por defecto', () => {
        const permiso = PERMISOS_CATALOGO.find(p => p.nombre === 'asistente.usar');
        expect(permiso).toBeDefined();
        expect(permiso.modulo).toBe('asistente');
        expect(permiso.roles).toEqual([]);
        expect(PERMISSION_TO_MODULE['asistente.usar']).toBe('asistente');
    });

    test('el módulo asistente es un módulo de plan con etiqueta', () => {
        expect(PLAN_MODULES).toContain('asistente');
        expect(MODULE_LABELS.asistente).toBeTruthy();
    });

    test('la migración 128 crea el add-on y la tabla, y el runner no la parte en sentencias rotas', () => {
        const sql = fs.readFileSync(
            path.join(__dirname, '../../../database/migrations/128_asistente_chef.sql'),
            'utf8'
        );
        // El runner parte por ";": cada trozo no vacío debe ser una sentencia completa (sin comentarios sueltos con ";").
        const sentencias = sql
            .split(';')
            .map(s => s.replace(/--.*$/gm, '').trim())
            .filter(Boolean);
        expect(sentencias).toHaveLength(2);
        expect(sentencias[0]).toMatch(/^INSERT IGNORE INTO addons/);
        expect(sentencias[0]).toContain("'asistente'");
        expect(sentencias[1]).toMatch(/^CREATE TABLE IF NOT EXISTS asistente_config/);
    });
});
