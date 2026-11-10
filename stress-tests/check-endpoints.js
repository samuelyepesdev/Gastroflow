/** Prints the HTTP status of each suite endpoint (to catch wrong paths / plan-gated modules before a run). */
const http = require('http');
const BASE = new URL(process.argv[2] || 'http://localhost:3100');
const eps = process.argv.slice(3);
const req = (m, p, h, b) =>
    new Promise((res, rej) => {
        const r = http.request({ host: BASE.hostname, port: BASE.port, path: p, method: m, headers: h }, x => {
            x.resume();
            x.on('end', () => res(x));
        });
        r.on('error', rej);
        if (b) {
            r.write(b);
        }
        r.end();
    });
(async () => {
    const b = JSON.stringify({ username: 'admin', password: 'admin123' });
    const l = await req(
        'POST',
        '/auth/login',
        { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) },
        b
    );
    const cookie = (l.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
    for (const e of eps) {
        const r = await req('GET', e, { Cookie: cookie, Accept: 'application/json' });
        console.log(String(r.statusCode), e, r.headers.location || '');
    }
})();
