// Sincroniza la tabla `permisos` con el catálogo (utils/permisosCatalogo.js). Corre en cada arranque
// (npm start) después de las migraciones; es idempotente. Ver PermisosCatalogoService.
//
// Uso: node scripts/sincronizar-permisos.js [--dry-run]

require('dotenv').config();
const PermisosCatalogoService = require('../services/Shared/PermisosCatalogoService');

if (require.main === module) {
    const dryRun = process.argv.includes('--dry-run');
    PermisosCatalogoService.sincronizar({ dryRun })
        .then(r => {
            const prefijo = dryRun ? '(simulación) ' : '';
            console.log(
                `✅ Permisos ${prefijo}: ${r.creados.length} nuevos, ${r.descripcionesActualizadas.length} descripciones actualizadas`
            );
            if (r.creados.length > 0) {
                console.log(`   Nuevos: ${r.creados.join(', ')}`);
            }
            if (r.rolesInexistentes.length > 0) {
                console.log(`   ⚠️  Roles del catálogo que no existen en la BD: ${r.rolesInexistentes.join(', ')}`);
            }
            if (r.huerfanos.length > 0) {
                console.log(`   ⚠️  Permisos en la BD que el catálogo no conoce (revisar): ${r.huerfanos.join(', ')}`);
            }
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ No se pudo sincronizar el catálogo de permisos:', error.message);
            process.exit(1);
        });
}
