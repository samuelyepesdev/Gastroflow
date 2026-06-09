/* eslint-disable no-console */
const REQUIRED_VARS = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'JWT_SECRET'];

const WEAK_JWT_PATTERNS = ['secret', 'password', 'change', 'example', '123', 'restaurante'];

function validateEnv() {
    const missing = REQUIRED_VARS.filter(key => !process.env[key]);
    if (missing.length > 0) {
        throw new Error(
            `[ENV] Variables de entorno requeridas no definidas: ${missing.join(', ')}\n` +
                `Asegúrate de tener un archivo .env configurado correctamente.`
        );
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (jwtSecret.length < 32) {
        throw new Error(
            `[ENV] JWT_SECRET debe tener al menos 32 caracteres.\n` +
                `Genera uno seguro con: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
        );
    }

    const isWeak = WEAK_JWT_PATTERNS.some(p => jwtSecret.toLowerCase().includes(p));
    if (isWeak) {
        console.warn(
            `[SECURITY] JWT_SECRET parece débil o usa el valor por defecto.\n` +
                `Genera uno seguro con: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
        );
    }
}

module.exports = { validateEnv };
