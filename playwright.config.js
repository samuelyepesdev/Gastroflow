const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests/e2e',
    timeout: 20000,
    expect: { timeout: 5000 },
    fullyParallel: false,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: [['html', { outputFolder: 'tests/e2e/reports', open: 'never' }], ['list']],
    use: {
        baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
        headless: true,
        screenshot: 'only-on-failure',
        video: 'off',
        locale: 'es-CO'
    },
    projects: [
        // Proyecto setup: hace login y guarda el estado de auth
        {
            name: 'setup',
            testMatch: '**/fixtures/auth.setup.js'
        },
        // Tests que requieren estar logueado
        {
            name: 'authenticated',
            testMatch: ['**/dashboard.spec.js', '**/modulos.spec.js', '**/validaciones.spec.js'],
            dependencies: ['setup'],
            use: {
                storageState: 'tests/e2e/.auth/admin.json'
            }
        },
        // Tests de auth (no requieren estado previo)
        {
            name: 'auth',
            testMatch: '**/auth.spec.js',
            use: { ...devices['Desktop Chrome'] }
        }
    ],
    webServer: {
        command: 'node server.js',
        url: process.env.E2E_BASE_URL || 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 15000
    }
});
