const { test, expect } = require('@playwright/test');

// Módulos que deben cargar sin errores 500 con un usuario admin autenticado
const MODULOS = [
    { ruta: '/productos', nombre: 'Productos' },
    { ruta: '/inventario', nombre: 'Inventario' },
    { ruta: '/mesas', nombre: 'Mesas' },
    { ruta: '/ventas', nombre: 'Ventas' },
    { ruta: '/facturas', nombre: 'Facturas' },
    { ruta: '/clientes', nombre: 'Clientes' },
    { ruta: '/recetas', nombre: 'Recetas' },
    { ruta: '/costeo', nombre: 'Costeo' },
    { ruta: '/servicios', nombre: 'Servicios' },
    { ruta: '/eventos', nombre: 'Eventos' },
    { ruta: '/soporte', nombre: 'Soporte' },
    { ruta: '/perfil', nombre: 'Perfil' },
    { ruta: '/configuracion', nombre: 'Configuración' }
];

test.describe('Carga de módulos (sin errores 500)', () => {
    for (const modulo of MODULOS) {
        test(`${modulo.nombre} (${modulo.ruta}) responde sin 500`, async ({ page }) => {
            const response = await page.goto(modulo.ruta);
            // Acepta 200, 302 (redirect), 403 (sin permiso) — cualquier cosa menos 500
            expect(response.status()).not.toBe(500);
            expect(response.status()).not.toBe(503);

            // Verifica que no se renderizó un stack trace
            const content = await page.content();
            expect(content).not.toContain('at Object.<anonymous>');
        });
    }
});

test.describe('Módulos admin (superadmin requerido)', () => {
    // Estos módulos son para superadmin — con un admin normal deben devolver
    // 403 o redirect, nunca 500
    const MODULOS_ADMIN = [
        { ruta: '/admin/dashboard', nombre: 'Admin Dashboard' },
        { ruta: '/admin/tenants', nombre: 'Admin Tenants' },
        { ruta: '/admin/planes', nombre: 'Admin Planes' }
    ];

    for (const modulo of MODULOS_ADMIN) {
        test(`${modulo.nombre} no devuelve 500`, async ({ page }) => {
            const response = await page.goto(modulo.ruta);
            expect(response.status()).not.toBe(500);
        });
    }
});
