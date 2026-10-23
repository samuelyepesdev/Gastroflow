// Informe de solo lectura: ¿qué administradores perderán acceso a módulos que su plan no incluye?
//
// Desde la migración 123 el plan es el techo de permisos del admin del restaurante. Quien nunca pasó por
// un cambio de plan tenía todos los permisos de su rol aunque su plan no los incluyera, y ahora los pierde
// (salvo los que se le concedan a mano). Este informe lista a quién afecta y qué módulos, para avisar
// o ajustar el plan antes de desplegar. Se puede correr antes o después de migrar. No modifica nada.
//
// Uso: node scripts/permisos-impacto.js

require('dotenv').config();
const db = require('../config/database');
const AddonRepository = require('../repositories/Admin/AddonRepository');
const { PERMISSION_TO_MODULE, planHasModule } = require('../utils/planPermissions');

const PLANES_CON_TODO = ['premium', 'definitivo'];

function parsearCaracteristicas(valor) {
    if (Array.isArray(valor)) {
        return valor;
    }
    try {
        return typeof valor === 'string' && valor ? JSON.parse(valor) : null;
    } catch {
        return null;
    }
}

async function tablaExiste(nombre) {
    const [r] = await db.query('SHOW TABLES LIKE ?', [nombre]);
    return r.length > 0;
}

async function informe() {
    const hayRespaldo = await tablaExiste('user_permisos_respaldo_123');
    // Antes de migrar la foto está en user_permisos; después, en el respaldo.
    const tablaFotos = hayRespaldo ? 'user_permisos_respaldo_123' : 'user_permisos';

    const [admins] = await db.query(
        `SELECT u.id, u.username, u.tenant_id, t.nombre AS tenant, pl.slug, pl.nombre AS plan_nombre, pl.caracteristicas
         FROM usuarios u
         INNER JOIN roles r ON r.id = u.rol_id AND r.nombre = 'admin'
         INNER JOIN tenants t ON t.id = u.tenant_id
         LEFT JOIN planes pl ON pl.id = t.plan_id
         WHERE u.activo = 1
         ORDER BY t.nombre, u.username`
    );

    const afectados = [];
    for (const admin of admins) {
        if (PLANES_CON_TODO.includes(admin.slug)) {
            continue;
        }
        const [conFoto] = await db.query(`SELECT 1 FROM ${tablaFotos} WHERE user_id = ? LIMIT 1`, [admin.id]);
        if (conFoto.length > 0) {
            continue; // su foto ya reflejaba un plan o un ajuste manual: la migración lo conserva
        }
        const plan = {
            slug: admin.slug,
            nombre: admin.plan_nombre,
            caracteristicas: parsearCaracteristicas(admin.caracteristicas)
        };
        const addons = await AddonRepository.getByTenant(admin.tenant_id).catch(() => []);
        const addonSlugs = addons.map(a => a.slug);
        const [permisos] = await db.query(
            `SELECT DISTINCT p.nombre FROM permisos p
             INNER JOIN rol_permisos rp ON rp.permiso_id = p.id
             INNER JOIN (SELECT id AS user_id, rol_id FROM usuarios UNION SELECT user_id, rol_id FROM usuario_roles) ur
                ON ur.rol_id = rp.rol_id
             WHERE ur.user_id = ?`,
            [admin.id]
        );
        const modulos = new Set();
        let perdidos = 0;
        for (const { nombre } of permisos) {
            const modulo = PERMISSION_TO_MODULE[nombre];
            if (modulo && !planHasModule(plan, modulo, addonSlugs)) {
                modulos.add(modulo);
                perdidos++;
            }
        }
        if (perdidos > 0) {
            afectados.push({ ...admin, perdidos, modulos: [...modulos].sort() });
        }
    }
    return { totalAdmins: admins.length, afectados };
}

if (require.main === module) {
    informe()
        .then(({ totalAdmins, afectados }) => {
            console.log(
                `Admins de restaurante activos: ${totalAdmins}. Perderán acceso a módulos de otros planes: ${afectados.length}`
            );
            afectados.forEach(a =>
                console.log(
                    `  - ${a.tenant} / ${a.username} (plan ${a.slug || 'sin plan'}): ${a.perdidos} permisos de ${a.modulos.join(', ')}`
                )
            );
            if (afectados.length > 0) {
                console.log(
                    '\nSi alguno debe conservar esos módulos: cámbiale el plan, agrégale el add-on, o concédele los permisos desde Admin > Permisos.'
                );
            }
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ No se pudo generar el informe:', error.message);
            process.exit(1);
        });
}

module.exports = { informe };
