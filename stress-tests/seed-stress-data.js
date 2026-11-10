/**
 * Seeds a realistic data volume into an ISOLATED stress database.
 * Refuses to run unless DB_NAME contains "stress" (never touches dev/prod data).
 *
 *   DB_NAME=gastroflow_stress node stress-tests/seed-stress-data.js [--facturas 60000]
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const DB_NAME = process.env.DB_NAME || '';
if (!/stress/i.test(DB_NAME)) {
    console.error(`Refusing to seed: DB_NAME="${DB_NAME}" does not contain "stress".`);
    process.exit(1);
}
const argv = process.argv.slice(2);
const argVal = (flag, def) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? Number(argv[i + 1]) : def;
};
const N_FACTURAS = argVal('--facturas', 60000);
const N_PRODUCTOS = argVal('--productos', 150);
const N_CLIENTES = argVal('--clientes', 3000);
const N_MESAS = argVal('--mesas', 40);
const TENANT_ID = argVal('--tenant', 1);

const chunk = (arr, n) => {
    const out = [];
    for (let i = 0; i < arr.length; i += n) {
        out.push(arr.slice(i, i + n));
    }
    return out;
};
const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

(async () => {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: DB_NAME,
        timezone: 'Z'
    });
    const t0 = Date.now();

    const [[{ c: hasProd }]] = await db.query('SELECT COUNT(*) c FROM productos WHERE tenant_id = ?', [TENANT_ID]);
    if (hasProd > 20) {
        console.log('Dataset already seeded, skipping.');
        await db.end();
        return;
    }

    const [cats] = await db.query('SELECT id FROM categorias WHERE tenant_id = ?', [TENANT_ID]);
    const catIds = cats.length ? cats.map(c => c.id) : [1];

    const productos = Array.from({ length: N_PRODUCTOS }, (_, i) => [
        TENANT_ID,
        `STR${String(i + 1).padStart(4, '0')}`,
        `Producto stress ${i + 1}`,
        catIds[i % catIds.length],
        0,
        rnd(4, 60) * 1000,
        0
    ]);
    await db.query(
        'INSERT INTO productos (tenant_id, codigo, nombre, categoria_id, precio_kg, precio_unidad, precio_libra) VALUES ?',
        [productos]
    );
    const [prods] = await db.query('SELECT id, precio_unidad FROM productos WHERE tenant_id = ?', [TENANT_ID]);

    await db.query('INSERT INTO mesas (tenant_id, numero, descripcion) VALUES ?', [
        [Array.from({ length: N_MESAS }, (_, i) => [TENANT_ID, `S${i + 1}`, `Mesa stress ${i + 1}`])].flat()
    ]);
    const [mesas] = await db.query('SELECT id FROM mesas WHERE tenant_id = ?', [TENANT_ID]);

    for (const part of chunk(
        Array.from({ length: N_CLIENTES }, (_, i) => [
            TENANT_ID,
            `Cliente stress ${i + 1}`,
            `3${String(100000000 + i).slice(0, 9)}`,
            `9${String(10000000 + i)}`
        ]),
        1000
    )) {
        await db.query('INSERT INTO clientes (tenant_id, nombre, telefono, numero_documento) VALUES ?', [part]);
    }
    const [clis] = await db.query('SELECT id FROM clientes WHERE tenant_id = ?', [TENANT_ID]);

    // Facturas spread over the last 12 months
    const formas = ['efectivo', 'transferencia', 'mixto'];
    const now = Date.now();
    for (let base = 0; base < N_FACTURAS; base += 5000) {
        const n = Math.min(5000, N_FACTURAS - base);
        const rows = Array.from({ length: n }, (_, i) => {
            const fecha = new Date(now - Math.random() * 365 * 86400000);
            const total = rnd(8, 180) * 1000;
            return [
                TENANT_ID,
                base + i + 1,
                clis[rnd(0, clis.length - 1)].id,
                fecha,
                total,
                formas[rnd(0, 2)],
                total,
                0
            ];
        });
        await db.query(
            'INSERT INTO facturas (tenant_id, numero, cliente_id, fecha, total, forma_pago, subtotal, evento_aparte) VALUES ?',
            [rows]
        );
    }
    const [[{ minId }]] = await db.query('SELECT MIN(id) minId FROM facturas WHERE tenant_id = ?', [TENANT_ID]);
    for (let base = 0; base < N_FACTURAS; base += 5000) {
        const rows = [];
        const n = Math.min(5000, N_FACTURAS - base);
        for (let i = 0; i < n; i++) {
            const facturaId = minId + base + i;
            for (let k = rnd(1, 4); k > 0; k--) {
                const p = prods[rnd(0, prods.length - 1)];
                const cant = rnd(1, 3);
                rows.push([facturaId, p.id, cant, p.precio_unidad, cant * p.precio_unidad]);
            }
        }
        for (const part of chunk(rows, 5000)) {
            await db.query(
                'INSERT INTO detalle_factura (factura_id, producto_id, cantidad, precio_unitario, subtotal) VALUES ?',
                [part]
            );
        }
    }

    // Closed orders with items (kitchen / history tables)
    const nPed = Math.round(N_FACTURAS / 5);
    for (let base = 0; base < nPed; base += 5000) {
        const n = Math.min(5000, nPed - base);
        await db.query('INSERT INTO pedidos (tenant_id, numero, mesa_id, estado, total, created_at) VALUES ?', [
            Array.from({ length: n }, (_, i) => [
                TENANT_ID,
                base + i + 1,
                mesas[rnd(0, mesas.length - 1)].id,
                'cerrado',
                rnd(8, 180) * 1000,
                new Date(now - Math.random() * 365 * 86400000)
            ])
        ]);
    }
    const [[{ pMin }]] = await db.query('SELECT MIN(id) pMin FROM pedidos WHERE tenant_id = ?', [TENANT_ID]);
    const items = [];
    for (let i = 0; i < nPed; i++) {
        for (let k = rnd(1, 4); k > 0; k--) {
            const p = prods[rnd(0, prods.length - 1)];
            items.push([TENANT_ID, pMin + i, p.id, 1, p.precio_unidad, p.precio_unidad, 'servido']);
        }
    }
    for (const part of chunk(items, 5000)) {
        await db.query(
            'INSERT INTO pedido_items (tenant_id, pedido_id, producto_id, cantidad, precio_unitario, subtotal, estado) VALUES ?',
            [part]
        );
    }

    console.log(
        `Seed OK in ${((Date.now() - t0) / 1000).toFixed(1)}s: ${N_PRODUCTOS} productos, ${N_MESAS} mesas, ` +
            `${N_CLIENTES} clientes, ${N_FACTURAS} facturas, ${nPed} pedidos.`
    );
    await db.end();
})().catch(err => {
    console.error('Seed failed:', err.message);
    process.exit(1);
});
