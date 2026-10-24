/**
 * El catálogo es la fuente única de permisos: estos tests evitan que se desincronice del código
 * (rutas que exigen un permiso que no existe, constantes huérfanas, módulos de plan inventados).
 */
const fs = require('fs');
const path = require('path');
const { PERMISOS_CATALOGO, PERMISSION_TO_MODULE, PERMISSION_SECTIONS } = require('../../../utils/permisosCatalogo');
const { PLAN_MODULES } = require('../../../utils/planPermissions');
const { PERMISSIONS } = require('../../../utils/constants');

const RAIZ = path.join(__dirname, '../../..');
const ROLES_CONOCIDOS = ['superadmin', 'admin', 'cajero', 'cocinero', 'mesero', 'propietario_pendiente'];
const nombres = PERMISOS_CATALOGO.map(p => p.nombre);

function archivosJs(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        const ruta = path.join(dir, e.name);
        if (e.isDirectory()) {
            return archivosJs(ruta);
        }
        return e.name.endsWith('.js') ? [ruta] : [];
    });
}

describe('permisosCatalogo', () => {
    test('cada permiso tiene nombre único con formato modulo.accion y cabe en la columna (50)', () => {
        expect(new Set(nombres).size).toBe(nombres.length);
        nombres.forEach(n => {
            expect(n).toMatch(/^[a-z_]+\.[a-z_]+$/);
            expect(n.length).toBeLessThanOrEqual(50);
        });
    });

    test('cada permiso tiene descripción, sección y roles válidos', () => {
        PERMISOS_CATALOGO.forEach(p => {
            expect(p.descripcion.length).toBeGreaterThan(0);
            expect(p.descripcion.length).toBeLessThanOrEqual(255);
            expect(p.seccion).toBeTruthy();
            expect(Array.isArray(p.roles)).toBe(true);
            p.roles.forEach(r => expect(ROLES_CONOCIDOS).toContain(r));
        });
    });

    test('el módulo de plan es null (no depende del plan) o un módulo real; nunca undefined', () => {
        PERMISOS_CATALOGO.forEach(p => {
            expect(p.modulo === null || PLAN_MODULES.includes(p.modulo)).toBe(true);
        });
    });

    test('PERMISSION_TO_MODULE y PERMISSION_SECTIONS se derivan del catálogo sin perder ni inventar permisos', () => {
        const conModulo = PERMISOS_CATALOGO.filter(p => p.modulo).map(p => p.nombre);
        expect(Object.keys(PERMISSION_TO_MODULE).sort()).toEqual(conModulo.sort());
        expect(Object.values(PERMISSION_SECTIONS).flat().sort()).toEqual([...nombres].sort());
    });

    test('todas las constantes PERMISSIONS existen en el catálogo', () => {
        Object.values(PERMISSIONS).forEach(nombre => expect(nombres).toContain(nombre));
    });

    test('todo permiso exigido en rutas, controladores o middleware existe en el catálogo', () => {
        const usados = new Set();
        const patron = /(?:requirePermission(?:ByMethod)?|permisos\.(?:includes|some))\s*\(([^)]*)\)/gs;
        for (const carpeta of ['routes', 'app', 'middleware']) {
            for (const archivo of archivosJs(path.join(RAIZ, carpeta))) {
                const texto = fs.readFileSync(archivo, 'utf8');
                for (const m of texto.matchAll(patron)) {
                    for (const lit of m[1].matchAll(/['"]([a-z_]+\.[a-z_]+)['"]/g)) {
                        usados.add(lit[1]);
                    }
                }
            }
        }
        expect(usados.size).toBeGreaterThan(20);
        expect([...usados].filter(n => !nombres.includes(n))).toEqual([]);
    });
});
