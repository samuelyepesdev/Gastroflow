/**
 * Defensive verification of access control, input handling and limits.
 * Runs ONLY against a local instance backed by an isolated "stress" database.
 *
 *   node stress-tests/security-checks.js [http://localhost:3100]
 */
require('dotenv').config();
const http = require('http');
const mysql = require('mysql2/promise');

const BASE = new URL(process.argv[2] || 'http://localhost:3100');
if (!['localhost', '127.0.0.1'].includes(BASE.hostname)) {
    console.error('Refusing to run: target must be localhost.');
    process.exit(1);
}
const DB_NAME = process.env.STRESS_DB || 'gastroflow_stress';
if (!/stress/i.test(DB_NAME)) {
    console.error('Refusing to run: database name must contain "stress".');
    process.exit(1);
}

const call = (method, path, { headers = {}, body } = {}) =>
    new Promise((resolve, reject) => {
        const payload = body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body);
        const h = { Accept: 'application/json', ...headers };
        if (payload !== null) {
            h['Content-Type'] = h['Content-Type'] || 'application/json';
            h['Content-Length'] = Buffer.byteLength(payload);
        }
        const r = http.request({ host: BASE.hostname, port: BASE.port, path, method, headers: h }, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () =>
                resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString() })
            );
        });
        r.on('error', e => resolve({ status: 0, headers: {}, text: String(e.code || e.message) }));
        if (payload !== null) {
            r.write(payload);
        }
        r.end();
    });

const results = [];
const record = (area, name, ok, detail) => {
    results.push({ area, name, ok, detail });
    console.log(`${ok ? 'OK  ' : 'FAIL'} [${area}] ${name}${detail ? ' — ' + detail : ''}`);
};

async function login(extraHeaders = {}) {
    const r = await call('POST', '/auth/login', {
        headers: extraHeaders,
        body: { username: 'admin', password: 'admin123' }
    });
    const cookie = (r.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
    return { r, cookie };
}

(async () => {
    // 1. Protected routes without a session
    const protectedRoutes = [
        '/api/clientes',
        '/api/productos',
        '/api/mesas',
        '/ventas',
        '/analitica/datos',
        '/api/dashboard/stats'
    ];
    for (const p of protectedRoutes) {
        const r = await call('GET', p);
        record('sin-sesion', `GET ${p}`, [301, 302, 401, 403].includes(r.status), `HTTP ${r.status}`);
    }
    const forged = await call('GET', '/api/clientes', { headers: { Cookie: 'auth_token=not.a.jwt' } });
    record(
        'sin-sesion',
        'JWT invalido rechazado',
        [301, 302, 401, 403].includes(forged.status),
        `HTTP ${forged.status}`
    );
    const noneAlg = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from('{"id":1,"rol":"superadmin","tenant_id":1}').toString('base64url')}.`;
    const none = await call('GET', '/api/clientes', { headers: { Cookie: `auth_token=${noneAlg}` } });
    record('sin-sesion', 'JWT alg=none rechazado', [301, 302, 401, 403].includes(none.status), `HTTP ${none.status}`);

    // 2. Inputs with SQL / HTML metacharacters (with a valid session)
    const { r: lr, cookie } = await login({ 'cf-connecting-ip': '10.77.0.1' });
    if (lr.status !== 200) {
        console.log(`Login failed (HTTP ${lr.status}); skipping authenticated checks.`);
    } else {
        const auth = { Cookie: cookie };
        const baseline = await call('GET', '/api/clientes', { headers: auth });
        for (const q of ["' OR '1'='1", '1; DROP TABLE clientes--', '%', '<img src=x onerror=alert(1)>']) {
            const r = await call('GET', `/ventas?q=${encodeURIComponent(q)}`, {
                headers: { ...auth, Accept: 'text/html' }
            });
            record(
                'inyeccion',
                `/ventas?q=${q.slice(0, 22)}`,
                r.status === 200 && !r.text.includes('<img src=x onerror'),
                `HTTP ${r.status}`
            );
        }
        const still = await call('GET', '/api/clientes', { headers: auth });
        record(
            'inyeccion',
            'tabla clientes intacta tras payloads',
            still.status === baseline.status && still.text.length === baseline.text.length
        );
        const badId = await call('GET', '/api/clientes/1%20OR%201=1', { headers: auth });
        const abc = await call('GET', '/api/clientes/abc', { headers: auth });
        record(
            'inyeccion',
            'id con SQL rechazado con 4xx',
            badId.status >= 400 && badId.status < 500,
            `HTTP ${badId.status}`
        );
        record(
            'validacion',
            'id no numerico responde 4xx (no 500)',
            abc.status >= 400 && abc.status < 500,
            `HTTP ${abc.status}`
        );

        // 3. Cross-tenant access (needs a second tenant with data)
        const db = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: DB_NAME
        });
        const [[mine]] = await db.query('SELECT tenant_id FROM usuarios WHERE username = ? LIMIT 1', ['admin']);
        const [[other]] = await db.query('SELECT id FROM tenants WHERE id <> ? ORDER BY id LIMIT 1', [mine.tenant_id]);
        if (!other) {
            console.log('SKIP [multi-tenant] no second tenant in the stress DB.');
        } else {
            const [[cli]] = await db.query('SELECT id FROM clientes WHERE tenant_id = ? LIMIT 1', [other.id]);
            const [[pro]] = await db.query('SELECT id FROM productos WHERE tenant_id = ? LIMIT 1', [other.id]);
            const [[fac]] = await db.query('SELECT id FROM facturas WHERE tenant_id = ? LIMIT 1', [other.id]);
            const probes = [
                cli && ['clientes', `/api/clientes/${cli.id}`],
                pro && ['productos', `/api/productos/${pro.id}`],
                fac && ['facturas', `/ventas/${fac.id}`]
            ].filter(Boolean);
            for (const [name, path] of probes) {
                const r = await call('GET', path, { headers: auth });
                record(
                    'multi-tenant',
                    `${name} de otro tenant no visible`,
                    ([403, 404].includes(r.status) || r.status === 302) && !r.text.includes('SECRETO'),
                    `HTTP ${r.status}`
                );
            }
            // Control: the owner of that tenant CAN read the same record (proves the paths above are real routes).
            const own = await call('POST', '/auth/login', {
                headers: { 'cf-connecting-ip': '10.77.0.3' },
                body: { username: 'admin2', password: 'admin123' }
            });
            const ownCookie = (own.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
            if (cli && own.status === 200) {
                const r = await call('GET', `/api/clientes/${cli.id}`, { headers: { Cookie: ownCookie } });
                record(
                    'multi-tenant',
                    'control: el dueño si ve su cliente',
                    r.status === 200 && r.text.includes('SECRETO'),
                    `HTTP ${r.status}`
                );
                const w = await call('PUT', `/api/clientes/${cli.id}`, { headers: auth, body: { nombre: 'hack' } });
                record(
                    'multi-tenant',
                    'PUT de cliente ajeno rechazado',
                    w.status >= 400 && w.status !== 500,
                    `HTTP ${w.status}`
                );
                const d = await call('DELETE', `/api/clientes/${cli.id}`, { headers: auth });
                record(
                    'multi-tenant',
                    'DELETE de cliente ajeno rechazado',
                    d.status >= 400 && d.status !== 500,
                    `HTTP ${d.status}`
                );
                const still = await call('GET', `/api/clientes/${cli.id}`, { headers: { Cookie: ownCookie } });
                record(
                    'multi-tenant',
                    'cliente ajeno sigue intacto',
                    still.status === 200 && still.text.includes('SECRETO')
                );
            }
            const hdr = await call('GET', '/api/clientes', { headers: { ...auth, 'X-Tenant-Id': String(other.id) } });
            record('multi-tenant', 'cabecera X-Tenant-Id ignorada', hdr.text === baseline.text, `HTTP ${hdr.status}`);
            const qs = await call('GET', `/api/clientes?tenant_id=${other.id}`, { headers: auth });
            record('multi-tenant', 'query tenant_id ignorado', qs.text === baseline.text, `HTTP ${qs.status}`);
        }
        await db.end();
    }

    // 4. Oversized body
    const big = JSON.stringify({ username: 'x'.repeat(5 * 1024 * 1024), password: 'y' });
    const rBig = await call('POST', '/auth/login', { headers: { 'cf-connecting-ip': '10.77.0.2' }, body: big });
    record('limites', 'username de 5 MB rechazado', [400, 413, 422].includes(rBig.status), `HTTP ${rBig.status}`);
    const rBad = await call('POST', '/auth/login', {
        headers: { 'cf-connecting-ip': '10.77.0.2' },
        body: '{"username":'
    });
    record('limites', 'JSON malformado no da 500', rBad.status >= 400 && rBad.status < 500, `HTTP ${rBad.status}`);

    // 5. Login rate limit (one source IP, then rotating the trusted header)
    const wrong = ip =>
        call('POST', '/auth/login', {
            headers: { 'cf-connecting-ip': ip },
            body: { username: 'admin', password: 'mal' }
        });
    const same = [];
    for (let i = 0; i < 8; i++) {
        same.push((await wrong('10.88.0.1')).status);
    }
    record('login', 'limite por IP corta tras 5 intentos', same.includes(429), `estados ${same.join(',')}`);
    const rotating = [];
    for (let i = 0; i < 8; i++) {
        rotating.push((await wrong(`10.88.1.${i + 1}`)).status);
    }
    record(
        'login',
        'el limite no se evade rotando cf-connecting-ip',
        rotating.includes(429),
        `estados ${rotating.join(',')} (si no hay 429, la cabecera se confia sin validar)`
    );

    const failed = results.filter(r => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} comprobaciones correctas.`);
    if (failed.length) {
        console.log('Hallazgos:');
        failed.forEach(f => console.log(` - [${f.area}] ${f.name} ${f.detail || ''}`));
    }
    process.exit(0);
})();
