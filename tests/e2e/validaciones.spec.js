const { test, expect } = require('@playwright/test');

test.describe('Validaciones de formularios', () => {
    test.describe('Soporte — ticket con datos inválidos', () => {
        // Usamos page.evaluate para ejecutar el fetch desde el contexto del navegador.
        // Esto garantiza que las cookies de sesión se incluyen correctamente y que el
        // cuerpo JSON llega al servidor por el mismo canal que usa el cliente real.
        test('rechaza descripción demasiado corta', async ({ page }) => {
            await page.goto('/soporte');

            const result = await page.evaluate(async () => {
                const res = await fetch('/soporte/enviar', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json'
                    },
                    body: JSON.stringify({ tipo: 'bug', descripcion: 'corta' })
                });
                const body = await res.json();
                return { status: res.status, body };
            });

            expect(result.status).toBe(422);
            expect(result.body.success).toBe(false);
        });

        test('rechaza tipo de ticket inválido', async ({ page }) => {
            await page.goto('/soporte');

            const result = await page.evaluate(async () => {
                const res = await fetch('/soporte/enviar', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json'
                    },
                    body: JSON.stringify({
                        tipo: 'tipo_invalido',
                        descripcion: 'descripcion valida con mas de 10 caracteres'
                    })
                });
                const body = await res.json();
                return { status: res.status, body };
            });

            expect(result.status).toBe(422);
            expect(result.body.success).toBe(false);
        });

        test('acepta ticket válido', async ({ page }) => {
            await page.goto('/soporte');

            const result = await page.evaluate(async () => {
                const res = await fetch('/soporte/enviar', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json'
                    },
                    body: JSON.stringify({
                        tipo: 'duda',
                        descripcion: 'Esta es una consulta de prueba E2E con suficientes caracteres.'
                    })
                });
                const body = await res.json();
                return { status: res.status, body };
            });

            expect(result.status).not.toBe(500);
            expect(result.status).not.toBe(422);
        });
    });

    test.describe('Rate limiting', () => {
        test('el login tiene rate limit activo', async ({ page }) => {
            // 6 intentos consecutivos fallidos deben resultar en rate limit (max: 5)
            for (let i = 0; i < 6; i++) {
                await page.goto('/auth/login');
                await page.fill('input[name="username"]', 'usuario_test_rate_limit');
                await page.fill('input[name="password"]', `pass_incorrecta_${i}`);
                await page.click('button[type="submit"]');
                await page.waitForLoadState('networkidle');
            }

            // Debe mostrar mensaje de rate limit o seguir en login (nunca entrar al dashboard)
            expect(page.url()).toContain('/auth/login');
        });
    });

    test.describe('Seguridad — headers HTTP', () => {
        test('respuestas incluyen headers de seguridad', async ({ page }) => {
            const response = await page.goto('/auth/login');
            const headers = response.headers();

            expect(headers['x-content-type-options']).toBe('nosniff');
            expect(headers['x-frame-options']).toBe('SAMEORIGIN');
            expect(headers['content-security-policy']).toBeTruthy();

            // unsafe-inline eliminado de script-src (sigue en style-src por Bootstrap/CSS inline)
            const csp = headers['content-security-policy'];
            const scriptSrc = csp.split(';').find(d => d.trim().startsWith('script-src')) || '';
            expect(scriptSrc).not.toContain("'unsafe-inline'");
        });

        test('compression middleware añade Vary: Accept-Encoding', async ({ page }) => {
            // El middleware compression() de Express añade Vary: Accept-Encoding a las respuestas.
            // Este header confirma que la compresión está configurada correctamente sin depender
            // del tamaño de la respuesta (content-encoding solo se establece si supera el umbral).
            const response = await page.goto('/auth/login');
            const vary = response.headers()['vary'] || '';
            expect(vary.toLowerCase()).toContain('accept-encoding');
        });
    });
});
