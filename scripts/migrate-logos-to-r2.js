/**
 * Migración única (no forma parte del boot chain de npm start): sube a
 * Cloudflare R2 los logos que hoy viven como BLOB en la base de datos
 * (tenants.logo_data y configuracion_impresion.logo_data, ver
 * 035_tenants_logo_blob.sql) y guarda la URL resultante en la nueva columna
 * logo_url (101_logo_url.sql). De ahí en adelante las subidas nuevas van
 * directo a R2 (ver PerfilController.update / ConfiguracionService.save) --
 * este script solo se ocupa de lo que ya existía antes de ese cambio.
 *
 * Seguro de re-ejecutar: solo toca filas con logo_data IS NOT NULL y
 * logo_url IS NULL, así que una vez migrado un tenant, correrlo de nuevo no
 * hace nada con él.
 *
 * Uso: node scripts/migrate-logos-to-r2.js
 */
require('dotenv').config();
const db = require('../config/database');
const R2StorageService = require('../services/Tenant/R2StorageService');

async function migrarTabla(tabla) {
    const [rows] = await db.query(
        `SELECT id, logo_data, logo_tipo FROM ${tabla} WHERE logo_data IS NOT NULL AND logo_url IS NULL`
    );

    console.log(`\n[${tabla}] ${rows.length} logo(s) por migrar.`);

    let migrados = 0;
    let fallidos = 0;

    for (const row of rows) {
        try {
            const tipo = row.logo_tipo || 'png';
            const url = await R2StorageService.uploadFile(
                Buffer.from(row.logo_data),
                `logo.${tipo}`,
                `image/${tipo}`,
                'logos'
            );
            await db.query(`UPDATE ${tabla} SET logo_url = ?, logo_data = NULL, logo_tipo = NULL WHERE id = ?`, [
                url,
                row.id
            ]);
            console.log(`  ✓ id ${row.id} -> ${url}`);
            migrados++;
        } catch (error) {
            console.error(`  ✗ id ${row.id}: ${error.message}`);
            fallidos++;
        }
    }

    console.log(`[${tabla}] Migrados: ${migrados}. Fallidos: ${fallidos}.`);
    return { migrados, fallidos };
}

async function main() {
    if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
        console.error(
            'R2 no está configurado (faltan R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY). Nada que hacer.'
        );
        process.exit(1);
    }

    const resultados = await Promise.all([migrarTabla('tenants'), migrarTabla('configuracion_impresion')]);

    const totalFallidos = resultados.reduce((sum, r) => sum + r.fallidos, 0);
    console.log('\nListo.');
    process.exit(totalFallidos > 0 ? 1 : 0);
}

main().catch(error => {
    console.error('Error inesperado migrando logos:', error);
    process.exit(1);
});
