const { test: setup, expect } = require('@playwright/test');
const path = require('path');

const AUTH_FILE = path.join(__dirname, '../.auth/admin.json');

setup('guardar estado de autenticación del admin', async ({ page }) => {
    const user = process.env.E2E_ADMIN_USER || 'admin';
    const pass = process.env.E2E_ADMIN_PASS || 'admin123';

    await page.goto('/auth/login');
    await expect(page).toHaveURL(/\/auth\/login/);

    await page.fill('input[name="username"]', user);
    await page.fill('input[name="password"]', pass);
    await page.click('button[type="submit"]');

    // Esperar a que el login sea exitoso (redirige fuera del login)
    await page.waitForURL(url => !url.toString().includes('/auth/login'), { timeout: 10000 });

    await page.context().storageState({ path: AUTH_FILE });
});
