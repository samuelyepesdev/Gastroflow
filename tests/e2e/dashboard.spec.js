const { test, expect } = require('@playwright/test');

test.describe('Dashboard', () => {
    test('carga el dashboard sin errores', async ({ page }) => {
        const response = await page.goto('/');
        expect(response.status()).toBeLessThan(500);
    });

    test('muestra la barra de navegación', async ({ page }) => {
        await page.goto('/');
        // La navbar debe estar presente (selector genérico)
        await expect(page.locator('nav, .navbar, [class*="navbar"]').first()).toBeVisible();
    });

    test('no muestra stack trace de error en producción', async ({ page }) => {
        await page.goto('/');
        const content = await page.content();
        expect(content).not.toContain('at Object.<anonymous>');
        expect(content).not.toContain('node_modules');
    });

    test('ruta 404 devuelve página de error correcta', async ({ page }) => {
        const response = await page.goto('/ruta-que-no-existe-en-absoluto');
        expect(response.status()).toBe(404);
    });
});
