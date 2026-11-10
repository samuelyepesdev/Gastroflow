/**
 * Creates a second tenant (with its own admin user and a little data) in the ISOLATED stress
 * database, so cross-tenant access can be checked. Refuses to run unless DB_NAME contains "stress".
 *
 *   DB_NAME=gastroflow_stress node stress-tests/seed-second-tenant.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const DB_NAME = process.env.DB_NAME || '';
if (!/stress/i.test(DB_NAME)) {
    console.error(`Refusing to seed: DB_NAME="${DB_NAME}" does not contain "stress".`);
    process.exit(1);
}

(async () => {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: DB_NAME,
        timezone: 'Z'
    });

    const [[existing]] = await db.query("SELECT id FROM tenants WHERE slug = 'otro-tenant'");
    if (existing) {
        console.log(`Second tenant already exists (id ${existing.id}).`);
        await db.end();
        return;
    }

    const [t] = await db.query(
        "INSERT INTO tenants (nombre, slug, plan_id, activo, estado_aprobacion) VALUES ('Otro Tenant', 'otro-tenant', 3, 1, 'aprobado')"
    );
    const tid = t.insertId;
    // Same password hash as the stress admin ("admin123"); different username and tenant.
    await db.query(
        `INSERT INTO usuarios (username, password_hash, email, nombre_completo, activo, rol_id, tenant_id)
         SELECT 'admin2', password_hash, 'admin2@otro.test', 'Admin Otro Tenant', 1, rol_id, ? FROM usuarios WHERE username = 'admin'`,
        [tid]
    );
    const [cat] = await db.query('INSERT INTO categorias (tenant_id, nombre) VALUES (?, ?)', [tid, 'Categoria otro']);
    await db.query(
        'INSERT INTO productos (tenant_id, codigo, nombre, categoria_id, precio_kg, precio_unidad, precio_libra) VALUES (?, ?, ?, ?, 0, 9999, 0)',
        [tid, 'OTR0001', 'Producto SECRETO otro tenant', cat.insertId]
    );
    const [cli] = await db.query(
        'INSERT INTO clientes (tenant_id, nombre, telefono, numero_documento) VALUES (?, ?, ?, ?)',
        [tid, 'Cliente SECRETO otro tenant', '3000000000', '900000001']
    );
    await db.query(
        "INSERT INTO facturas (tenant_id, numero, cliente_id, fecha, total, forma_pago, subtotal, evento_aparte) VALUES (?, 1, ?, NOW(), 50000, 'efectivo', 50000, 0)",
        [tid, cli.insertId]
    );
    await db.query('INSERT INTO mesas (tenant_id, numero, descripcion) VALUES (?, ?, ?)', [
        tid,
        'X1',
        'Mesa otro tenant'
    ]);

    console.log(`Second tenant created: id ${tid}, user admin2 / admin123.`);
    await db.end();
})().catch(err => {
    console.error('Seed failed:', err.message);
    process.exit(1);
});
