// Limpia las "fotos" de permisos de los admins de restaurante que solo reflejaban su plan.
//
// Antes, cada cambio de plan le grababa al admin la lista completa de permisos del plan. Esa foto
// nunca recibía los permisos nuevos que se agregaban al rol después. Con el modelo de excepciones
// (migración 123) el plan ya es un techo que se calcula en el momento, así que esas fotos sobran.
//
// Se limpia solo cuando la foto original era exactamente "lo que el plan incluía entre los permisos
// que ya existían al grabarla". Cualquier señal de ajuste manual (un permiso de más fuera del plan o
// uno de menos dentro del plan) la conserva. La foto original sigue en user_permisos_respaldo_123.
//
// Los admins con ajustes manuales quedan exactamente como estaban: sus excepciones se recalculan contra
// lo que hoy les corresponde por rol y plan (la migración las calculó solo contra el rol).
//
// Corre una sola vez (se registra en schema_migrations). Uso: node scripts/normalizar-permisos-admins.js [--dry-run]

require('dotenv').config();
const db = require('../config/database');
const { getPermissionNamesForPlan } = require('../services/Admin/PlanPermissionSyncService');
const PermisosUsuarioService = require('../services/Shared/PermisosUsuarioService');
const PermisoRepository = require('../repositories/Admin/PermisoRepository');

const NOMBRE = '123_normalizar_permisos_admins';
const PLANES_CON_TODO = ['premium', 'definitivo'];

/**
 * ¿La foto es la de un cambio de plan y no un ajuste manual?
 * Una foto de plan contiene los permisos del plan que existían cuando se grabó, y los permisos
 * se crean con ids crecientes: por eso debe ser igual al plan recortado hasta su id más alto.
 * @param {number[]} snapshotIds - permisos de la foto
 * @param {number[]} planIds - permisos que el plan incluye hoy
 */
function esSnapshotDePlan(snapshotIds, planIds) {
    if (!snapshotIds.length) {
        return false;
    }
    const tope = Math.max(...snapshotIds);
    const esperado = planIds.filter(id => id <= tope);
    if (esperado.length !== snapshotIds.length) {
        return false;
    }
    const foto = new Set(snapshotIds);
    return esperado.every(id => foto.has(id));
}

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

async function normalizar({ dryRun = false } = {}) {
    await db.query(
        'CREATE TABLE IF NOT EXISTS schema_migrations (migration_name VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)'
    );
    const [hecho] = await db.query('SELECT 1 FROM schema_migrations WHERE migration_name = ?', [NOMBRE]);
    if (hecho.length > 0) {
        return { omitido: true };
    }
    const [tabla] = await db.query("SHOW TABLES LIKE 'user_permisos_respaldo_123'");
    if (tabla.length === 0) {
        return { omitido: true, motivo: 'sin respaldo (la migración 123 aún no corrió)' };
    }

    const [permisos] = await db.query('SELECT id, nombre FROM permisos');
    const idPorNombre = new Map(permisos.map(p => [p.nombre, p.id]));

    const [admins] = await db.query(
        `SELECT DISTINCT u.id, pl.slug, pl.nombre AS plan_nombre, pl.caracteristicas
         FROM user_permisos_respaldo_123 s
         INNER JOIN usuarios u ON u.id = s.user_id
         INNER JOIN roles r ON r.id = u.rol_id AND r.nombre = 'admin'
         LEFT JOIN tenants t ON t.id = u.tenant_id
         LEFT JOIN planes pl ON pl.id = t.plan_id`
    );

    const limpiar = [];
    const conservar = [];
    for (const admin of admins) {
        if (PLANES_CON_TODO.includes(admin.slug)) {
            // Su foto nunca se aplicaba: el plan les da todo
            limpiar.push(admin.id);
            continue;
        }
        const plan = {
            slug: admin.slug,
            nombre: admin.plan_nombre,
            caracteristicas: parsearCaracteristicas(admin.caracteristicas)
        };
        const planIds = getPermissionNamesForPlan(plan)
            .map(n => idPorNombre.get(n))
            .filter(Boolean);
        const [foto] = await db.query('SELECT permiso_id FROM user_permisos_respaldo_123 WHERE user_id = ?', [
            admin.id
        ]);
        const fotoIds = foto.map(f => f.permiso_id);
        if (esSnapshotDePlan(fotoIds, planIds)) {
            limpiar.push(admin.id);
        } else {
            conservar.push({ id: admin.id, fotoIds });
        }
    }

    if (!dryRun) {
        if (limpiar.length > 0) {
            await db.query('DELETE FROM user_permisos WHERE user_id IN (?)', [limpiar]);
        }
        for (const { id, fotoIds } of conservar) {
            const resuelto = await PermisosUsuarioService.resolver(id);
            const base = new Set(await PermisoRepository._idsPorNombre(resuelto.base));
            const foto = new Set(fotoIds);
            await PermisoRepository.setExcepcionesForUser(id, {
                conceder: fotoIds.filter(pid => !base.has(pid)),
                denegar: [...base].filter(pid => !foto.has(pid))
            });
        }
        await db.query('INSERT INTO schema_migrations (migration_name) VALUES (?)', [NOMBRE]);
    }
    return { omitido: false, dryRun, limpiados: limpiar, conservados: conservar.map(c => c.id) };
}

if (require.main === module) {
    normalizar({ dryRun: process.argv.includes('--dry-run') })
        .then(r => {
            if (r.omitido) {
                console.log(
                    `ℹ️  Normalización de permisos de admins: omitida${r.motivo ? ` (${r.motivo})` : ' (ya se hizo)'}`
                );
            } else {
                console.log(
                    `✅ Permisos de admins${r.dryRun ? ' (simulación)' : ''}: ${r.limpiados.length} vuelven a seguir su rol y plan, ${r.conservados.length} conservan sus ajustes manuales`
                );
                if (r.conservados.length > 0) {
                    console.log(`   Usuarios con ajustes conservados: ${r.conservados.join(', ')}`);
                }
            }
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ No se pudo normalizar los permisos de los admins:', error.message);
            process.exit(1);
        });
}

module.exports = { normalizar, esSnapshotDePlan };
