require('dotenv').config();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('../config/database');
const { ROLES } = require('../utils/constants');

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@restaurante.com';
const ADMIN_NOMBRE = process.env.ADMIN_NOMBRE || 'Administrador';
const SUPERADMIN_USERNAME = process.env.SUPERADMIN_USERNAME || 'superadmin';
const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || 'superadmin@restaurante.com';
const SUPERADMIN_NOMBRE = process.env.SUPERADMIN_NOMBRE || 'Superadministrador';

/**
 * Resuelve la contraseña de un usuario administrativo de forma perezosa (solo al
 * crearlo/sobreescribirlo, nunca en el camino normal de "ya existe, omitido" que
 * corre en cada deploy). Si no hay variable de entorno y estamos en producción,
 * generamos una aleatoria en vez de caer en un default público y conocido
 * (admin123/superadmin123) -- ver incidente 2026-09-20.
 *
 * `hasExplicit` distingue "el operador pidió esta contraseña a propósito" de
 * "no dijo nada": CREATE_ADMIN_OVERWRITE es un flag global que aplica a admin
 * y superadmin a la vez, así que al sobreescribir NUNCA se genera una
 * contraseña aleatoria para una cuenta que no se pidió tocar -- eso pisaría
 * silenciosamente una contraseña que el operador ya había rotado a mano.
 */
function resolvePassword(envVar, fallbackDev, username) {
    const explicit = process.env[envVar];
    return {
        hasExplicit: Boolean(explicit),
        resolve() {
            if (explicit) {
                return explicit;
            }

            if (process.env.NODE_ENV === 'production') {
                const generated = crypto.randomBytes(12).toString('base64url');
                console.warn(
                    `[SECURITY] ${envVar} no está definido. Se generó una contraseña aleatoria para "${username}":`
                );
                console.warn(`  ${generated}`);
                console.warn(`  Guárdala ahora (no se vuelve a mostrar) y cámbiala en /auth/cambiar-password.`);
                return generated;
            }

            return fallbackDev;
        }
    };
}

async function getRoleId(nombre) {
    const [rows] = await db.query('SELECT id FROM roles WHERE nombre = ?', [nombre]);
    if (rows.length === 0) {
        throw new Error(`Rol "${nombre}" no encontrado.`);
    }
    return rows[0].id;
}

async function ensureTenant(slug, nombre) {
    const [rows] = await db.query('SELECT id FROM tenants WHERE slug = ?', [slug]);
    if (rows.length > 0) {
        return rows[0].id;
    }
    const [result] = await db.query('INSERT INTO tenants (nombre, slug, activo) VALUES (?, ?, TRUE)', [nombre, slug]);
    return result.insertId;
}

/**
 * Crea el usuario solo si no existe. Si ya existe, no se modifica (evita resetear
 * contraseñas en cada deploy en producción).
 * Para forzar actualización de UNA cuenta puntual: CREATE_ADMIN_OVERWRITE=true
 * + su variable de contraseña explícita (ADMIN_PASSWORD o SUPERADMIN_PASSWORD).
 * Sin esa variable explícita, esa cuenta se deja intacta aunque el flag esté activo.
 */
async function createUserIfNotExists({ username, passwordResolver, email, nombreCompleto, rolNombre, tenantId }) {
    const [existing] = await db.query('SELECT id FROM usuarios WHERE username = ?', [username]);
    if (existing.length > 0) {
        if (process.env.CREATE_ADMIN_OVERWRITE === 'true' && passwordResolver.hasExplicit) {
            const rolId = await getRoleId(rolNombre);
            const passwordHash = await bcrypt.hash(passwordResolver.resolve(), 10);
            await db.query(
                'UPDATE usuarios SET password_hash = ?, email = ?, nombre_completo = ?, rol_id = ?, tenant_id = ?, activo = TRUE WHERE username = ?',
                [passwordHash, email || null, nombreCompleto || null, rolId, tenantId || null, username]
            );
            console.log(`  Actualizado (OVERWRITE): ${username}`);
        } else if (process.env.CREATE_ADMIN_OVERWRITE === 'true') {
            console.log(`  Ya existe, omitido (sin contraseña explícita para sobreescribir): ${username}`);
        } else {
            console.log(`  Ya existe, omitido: ${username}`);
        }
        return existing[0].id;
    }
    const rolId = await getRoleId(rolNombre);
    const passwordHash = await bcrypt.hash(passwordResolver.resolve(), 10);
    const [result] = await db.query(
        'INSERT INTO usuarios (username, password_hash, email, nombre_completo, rol_id, tenant_id, activo) VALUES (?, ?, ?, ?, ?, ?, TRUE)',
        [username, passwordHash, email || null, nombreCompleto || null, rolId, tenantId || null]
    );
    console.log(`  Creado: ${username}`);
    return result.insertId;
}

async function createAdminUsers() {
    try {
        const tenantId = await ensureTenant('principal', 'Principal');
        console.log('Usuarios administrativos:');
        await createUserIfNotExists({
            username: ADMIN_USERNAME,
            passwordResolver: resolvePassword('ADMIN_PASSWORD', 'admin123', ADMIN_USERNAME),
            email: ADMIN_EMAIL,
            nombreCompleto: ADMIN_NOMBRE,
            rolNombre: ROLES.ADMIN,
            tenantId
        });
        await createUserIfNotExists({
            username: SUPERADMIN_USERNAME,
            passwordResolver: resolvePassword('SUPERADMIN_PASSWORD', 'superadmin123', SUPERADMIN_USERNAME),
            email: SUPERADMIN_EMAIL,
            nombreCompleto: SUPERADMIN_NOMBRE,
            rolNombre: ROLES.SUPERADMIN,
            tenantId: null
        });
        console.log('Listo.');
        process.exit(0);
    } catch (error) {
        console.error('Error creando usuarios:', error.message);
        process.exit(1);
    }
}

createAdminUsers();
