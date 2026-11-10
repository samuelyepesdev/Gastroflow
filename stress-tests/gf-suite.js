/**
 * GastroFlow performance suite (controlled environment only).
 *
 * Phases: endpoint sweep -> mixed-workload scenarios (ramp / spike / soak)
 * while sampling server process CPU/RAM and MySQL (performance_schema digests,
 * connections). Writes stress-tests/reports/suite-<ts>.json.
 *
 *   DB_NAME=gastroflow_stress PORT=3100 npm start (separate terminal)
 *   node stress-tests/gf-suite.js --url http://localhost:3100 [--sweep 8] [--soak 60]
 *
 * SAFETY: refuses to run unless the target is localhost/127.0.0.1 and the DB
 * (STRESS_DB) contains "stress". Never point it at staging/production.
 */
require('dotenv').config();
const autocannon = require('autocannon');
const http = require('http');
const mysql = require('mysql2/promise');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const arg = (f, d) => {
    const i = process.argv.indexOf(f);
    return i >= 0 ? process.argv[i + 1] : d;
};
const BASE = arg('--url', process.env.STRESS_BASE_URL || 'http://localhost:3100');
const SWEEP_SECONDS = Number(arg('--sweep', 8));
const SWEEP_CONN = Number(arg('--conn', 20));
const SOAK_SECONDS = Number(arg('--soak', 60));
const USERNAME = process.env.STRESS_USERNAME || 'admin';
const PASSWORD = process.env.STRESS_PASSWORD || 'admin123';
const STRESS_DB = process.env.STRESS_DB || 'gastroflow_stress';

const host = new URL(BASE).hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    console.error(`Refusing to run against non-local target "${host}".`);
    process.exit(1);
}
if (!/stress/i.test(STRESS_DB)) {
    console.error('Refusing to run: STRESS_DB must contain "stress".');
    process.exit(1);
}

// Read-only endpoints that matter in daily operation (HTML pages + JSON APIs).
const ENDPOINTS = [
    '/api/health',
    '/auth/me',
    '/api/dashboard/stats',
    '/api/dashboard/eventos-calendario',
    '/dashboard',
    '/productos',
    '/api/productos',
    '/api/productos/categorias',
    '/api/productos/buscar?q=stress',
    '/api/clientes',
    '/api/clientes/buscar?q=stress',
    '/mesas',
    '/api/mesas',
    '/api/mesas/listar',
    '/pos',
    '/pos/productos',
    '/pos/stats',
    '/pos/borradores',
    '/cocina',
    '/api/cocina/cola',
    '/caja',
    '/caja/historial',
    '/ventas?page=1',
    '/analitica/datos',
    '/finanzas/api/chart-data',
    '/perfil/api/crecimiento',
    '/inventario/api/resumen',
    '/inventario/api/insumos',
    '/inventario/api/movimientos',
    '/recetas/api/recetas',
    '/costeo/api/insumos',
    '/costeo/api/costeo/resumen-financiero',
    '/api/servicios',
    '/api/combos-venta'
];

// Weighted "restaurant at lunch rush" mix used by the scenarios.
const MIX = [
    ['/api/mesas', 25],
    ['/api/productos', 15],
    ['/pos/productos', 15],
    ['/api/cocina/cola', 15],
    ['/api/dashboard/stats', 10],
    ['/ventas?page=1', 5],
    ['/api/productos/buscar?q=stress', 10]
];

function request(method, p, { headers = {}, body } = {}) {
    return new Promise((resolve, reject) => {
        const u = new URL(p, BASE);
        const req = http.request(
            { host: u.hostname, port: u.port, path: u.pathname + u.search, method, headers },
            res => {
                const chunks = [];
                res.on('data', c => chunks.push(c));
                res.on('end', () =>
                    resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() })
                );
            }
        );
        req.on('error', reject);
        if (body) {
            req.write(body);
        }
        req.end();
    });
}

/** Login respecting the 5/min limiter: waits out a 429 instead of hammering. */
async function login() {
    for (let attempt = 0; attempt < 4; attempt++) {
        const body = JSON.stringify({ username: USERNAME, password: PASSWORD });
        const r = await request('POST', '/auth/login', {
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
            body
        });
        if (r.status === 200) {
            const cookie = (r.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
            return cookie;
        }
        if (r.status === 429) {
            console.log('  login rate-limited, waiting 62s...');
            await new Promise(res => setTimeout(res, 62000));
            continue;
        }
        throw new Error(`Login failed: HTTP ${r.status} ${r.body.slice(0, 120)}`);
    }
    throw new Error('Login failed after retries');
}

// The global limiter (5000 req / 15 min / IP) would turn a single-IP load test into a wall of 429s and hide the
// real capacity. The app trusts `cf-connecting-ip` (utils/clientIp.js), so each request carries a fresh random IP.
// Pass --keep-limiter to measure WITH the limiter instead.
const KEEP_LIMITER = process.argv.includes('--keep-limiter');
const randomIp = () =>
    `10.${(Math.random() * 255) | 0}.${(Math.random() * 255) | 0}.${1 + ((Math.random() * 253) | 0)}`;
const withRotatingIp = reqs =>
    reqs.map(r => ({
        ...r,
        setupRequest: req => {
            req.headers = { ...(req.headers || {}), 'cf-connecting-ip': randomIp() };
            return req;
        }
    }));

function run(opts) {
    if (!KEEP_LIMITER) {
        const base = opts.requests || [{ method: 'GET', path: new URL(opts.url).pathname + new URL(opts.url).search }];
        opts = { ...opts, url: opts.requests ? opts.url : new URL(opts.url).origin, requests: withRotatingIp(base) };
    }
    return new Promise((resolve, reject) =>
        autocannon({ ...opts, timeout: 30 }, (err, res) => (err ? reject(err) : resolve(res)))
    );
}

/** Wait until MySQL has no running statements besides ours, so in-flight requests don't leak into the next endpoint. */
async function drain(db, maxMs = 30000) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
        const [[row]] = await db.query("SHOW GLOBAL STATUS LIKE 'Threads_running'");
        if (Number(row.Value) <= 1) {
            return;
        }
        await new Promise(r => setTimeout(r, 300));
    }
}

const summarize = r => ({
    rps: Math.round(r.requests.average),
    total: r.requests.total,
    p50: r.latency.p50,
    p97_5: r.latency.p97_5,
    p99: r.latency.p99,
    max: r.latency.max,
    avg: Math.round(r.latency.average),
    non2xx: r.non2xx,
    errors: r.errors,
    timeouts: r.timeouts,
    status: Object.fromEntries(Object.entries(r.statusCodeStats || {}).map(([k, v]) => [k, v.count])),
    mbps: +(r.throughput.average / 1e6).toFixed(2)
});

function serverPid() {
    try {
        const out = execFileSync('powershell', [
            '-NoProfile',
            '-Command',
            `(Get-NetTCPConnection -LocalPort ${new URL(BASE).port} -State Listen | Select -First 1).OwningProcess`
        ])
            .toString()
            .trim();
        return Number(out) || null;
    } catch {
        return null;
    }
}

function sampleProc(pid) {
    try {
        const out = execFileSync('powershell', [
            '-NoProfile',
            '-Command',
            `$p=Get-Process -Id ${pid}; "$($p.CPU)|$($p.WorkingSet64)"`
        ])
            .toString()
            .trim();
        const [cpu, ws] = out.split('|').map(Number);
        return { t: Date.now(), cpuSec: cpu, rssMb: Math.round(ws / 1048576) };
    } catch {
        return null;
    }
}

(async () => {
    console.log(`GastroFlow suite -> ${BASE}  (db: ${STRESS_DB})`);
    const db = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: STRESS_DB
    });
    const pid = serverPid();
    const procSamples = [];
    const sampler = pid
        ? setInterval(() => {
              const s = sampleProc(pid);
              if (s) {
                  procSamples.push(s);
              }
          }, 3000)
        : null;
    const dbSamples = [];
    const dbSampler = setInterval(async () => {
        try {
            const [rows] = await db.query(
                "SHOW GLOBAL STATUS WHERE Variable_name IN ('Threads_connected','Threads_running','Max_used_connections','Slow_queries')"
            );
            dbSamples.push({ t: Date.now(), ...Object.fromEntries(rows.map(r => [r.Variable_name, Number(r.Value)])) });
        } catch {
            /* sampler is best-effort */
        }
    }, 2000);

    const cookie = await login();
    const headers = { Cookie: cookie, Accept: 'application/json' };

    const report = { base: BASE, startedAt: new Date().toISOString(), node: process.version, sweep: [], scenarios: {} };

    // ---- Phase 1: endpoint sweep (fresh digest table, so DB cost is attributed) ----
    await db.query('TRUNCATE TABLE performance_schema.events_statements_summary_by_digest');
    console.log(`\n== Endpoint sweep: ${ENDPOINTS.length} endpoints x ${SWEEP_SECONDS}s @ ${SWEEP_CONN} conn`);
    for (const ep of ENDPOINTS) {
        const [[before]] = await db.query(
            'SELECT SUM(COUNT_STAR) q, SUM(SUM_ROWS_EXAMINED) r FROM performance_schema.events_statements_summary_by_digest WHERE SCHEMA_NAME = ?',
            [STRESS_DB]
        );
        const res = await run({ url: BASE + ep, connections: SWEEP_CONN, duration: SWEEP_SECONDS, headers });
        await drain(db);
        const [[after]] = await db.query(
            'SELECT SUM(COUNT_STAR) q, SUM(SUM_ROWS_EXAMINED) r FROM performance_schema.events_statements_summary_by_digest WHERE SCHEMA_NAME = ?',
            [STRESS_DB]
        );
        const s = summarize(res);
        const reqs = Math.max(1, s.total);
        s.dbQueriesPerReq = +((Number(after.q || 0) - Number(before.q || 0)) / reqs).toFixed(2);
        s.rowsExaminedPerReq = Math.round((Number(after.r || 0) - Number(before.r || 0)) / reqs);
        report.sweep.push({ endpoint: ep, ...s });
        console.log(
            `${ep.padEnd(42)} ${String(s.rps).padStart(6)} rps  p50 ${String(s.p50).padStart(5)}  p99 ${String(s.p99).padStart(6)} ms  ` +
                `non2xx ${s.non2xx}  q/req ${s.dbQueriesPerReq}  rows/req ${s.rowsExaminedPerReq}`
        );
    }

    // Top DB consumers from the sweep.
    const [digests] = await db.query(
        `SELECT LEFT(DIGEST_TEXT, 220) AS query_text, COUNT_STAR AS calls,
                ROUND(SUM_TIMER_WAIT/1e9) AS total_ms, ROUND(AVG_TIMER_WAIT/1e9,2) AS avg_ms,
                ROUND(MAX_TIMER_WAIT/1e9) AS max_ms, SUM_ROWS_EXAMINED AS rows_examined,
                SUM_ROWS_SENT AS rows_sent, SUM_NO_INDEX_USED AS no_index, SUM_CREATED_TMP_DISK_TABLES AS tmp_disk
         FROM performance_schema.events_statements_summary_by_digest
         WHERE SCHEMA_NAME = ? AND DIGEST_TEXT NOT LIKE 'SHOW %' AND DIGEST_TEXT NOT LIKE '%performance\\_schema%'
         ORDER BY SUM_TIMER_WAIT DESC LIMIT 25`,
        [STRESS_DB]
    );
    report.topQueries = digests;

    // ---- Phase 2: mixed workload scenarios ----
    const requests = MIX.flatMap(([p, w]) => Array.from({ length: w }, () => ({ method: 'GET', path: p })));
    const scenarios = [
        ['baseline', 10, 20],
        ['ramp_50', 50, 20],
        ['ramp_100', 100, 20],
        ['spike_250', 250, 20],
        ['soak_50', 50, SOAK_SECONDS]
    ];
    for (const [name, connections, duration] of scenarios) {
        console.log(`\n== Scenario ${name}: ${connections} conn x ${duration}s (mixed workload)`);
        const res = await run({ url: BASE, connections, duration, headers, requests });
        const s = summarize(res);
        report.scenarios[name] = { connections, duration, ...s };
        console.log(
            `   ${s.rps} rps | p50 ${s.p50} | p97.5 ${s.p97_5} | p99 ${s.p99} | max ${s.max} ms | non2xx ${s.non2xx} | errors ${s.errors} | timeouts ${s.timeouts} | ${JSON.stringify(s.status)}`
        );
        await new Promise(r => setTimeout(r, 3000)); // cool-down so scenarios don't bleed into each other
    }

    clearInterval(dbSampler);
    if (sampler) {
        clearInterval(sampler);
    }
    report.process = {
        pid,
        peakRssMb: Math.max(0, ...procSamples.map(s => s.rssMb)),
        samples: procSamples.length,
        cpuSecondsTotal: procSamples.length ? +(procSamples.at(-1).cpuSec - procSamples[0].cpuSec).toFixed(1) : null,
        wallSeconds: procSamples.length ? Math.round((procSamples.at(-1).t - procSamples[0].t) / 1000) : null
    };
    report.mysql = {
        peakThreadsConnected: Math.max(0, ...dbSamples.map(s => s.Threads_connected || 0)),
        peakThreadsRunning: Math.max(0, ...dbSamples.map(s => s.Threads_running || 0)),
        maxUsedConnections: dbSamples.at(-1)?.Max_used_connections,
        slowQueries: dbSamples.at(-1)?.Slow_queries
    };
    report.finishedAt = new Date().toISOString();

    fs.mkdirSync(path.join(__dirname, 'reports'), { recursive: true });
    const out = path.join(__dirname, 'reports', `suite-${Date.now()}.json`);
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
    console.log(
        `\nProcess: ${JSON.stringify(report.process)}\nMySQL:   ${JSON.stringify(report.mysql)}\nReport:  ${out}`
    );
    await db.end();
})().catch(err => {
    console.error('Suite failed:', err);
    process.exit(1);
});
