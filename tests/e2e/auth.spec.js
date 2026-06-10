const { test, expect } = require('@playwright/test');

const VALID_USER = process.env.E2E_ADMIN_USER || 'admin';
const VALID_PASS = process.env.E2E_ADMIN_PASS || 'admin123';

test.describe('Autenticación', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/auth/login');
    });

    test('muestra el formulario de login', async ({ page }) => {
        await expect(page.locator('input[name="username"]')).toBeVisible();
        await expect(page.locator('input[name="password"]')).toBeVisible();
        await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test('login con credenciales inválidas muestra error', async ({ page }) => {
        await page.fill('input[name="username"]', 'usuario_inexistente');
        await page.fill('input[name="password"]', 'password_errada');
        await page.click('button[type="submit"]');

        // Debe quedarse en /auth/login o mostrar un mensaje de error
        await expect(page).toHaveURL(/\/auth\/login/);
    });

    test('login con contraseña vacía no procede', async ({ page }) => {
        await page.fill('input[name="username"]', VALID_USER);
        // password vacío — el campo es required en HTML
        await page.click('button[type="submit"]');
        await expect(page).toHaveURL(/\/auth\/login/);
    });

    test('login válido redirige al dashboard', async ({ page }) => {
        await page.fill('input[name="username"]', VALID_USER);
        await page.fill('input[name="password"]', VALID_PASS);
        await page.click('button[type="submit"]');

        await page.waitForURL(url => !url.toString().includes('/auth/login'), { timeout: 10000 });
        expect(page.url()).not.toContain('/auth/login');
    });

    test('ruta protegida sin auth redirige a login', async ({ page }) => {
        await page.goto('/productos');
        await expect(page).toHaveURL(/\/auth\/login/);
    });

    test('logout redirige a login', async ({ page }) => {
        // Login primero
        await page.fill('input[name="username"]', VALID_USER);
        await page.fill('input[name="password"]', VALID_PASS);
        await page.click('button[type="submit"]');
        await page.waitForURL(url => !url.toString().includes('/auth/login'), { timeout: 10000 });

        // Logout
        await page.goto('/auth/logout');
        await expect(page).toHaveURL(/\/auth\/login/);
    });
});
