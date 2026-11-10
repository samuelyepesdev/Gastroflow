/**
 * Prints every parameterless GET route registered in the Express app (one per line).
 * Used to build the endpoint matrix for the load/stress run.
 *   DB_NAME=gastroflow_stress node stress-tests/list-routes.js
 */
const app = require('../app');

const out = new Set();
const BACKSLASH_SLASH = /\\\//g;

function mountPath(layer) {
    const src = layer.regexp.source
        .replace('^\\/', '/')
        .replace('\\/?(?=\\/|$)', '')
        .replace(BACKSLASH_SLASH, '/')
        .replace(/\$$/, '')
        .replace(/\(\?:\(\[\^\/\]\+\?\)\)/g, ':p');
    return src === '^' || src === '/' ? '' : src;
}

function walk(stack, prefix) {
    for (const layer of stack) {
        if (layer.route) {
            for (const m of Object.keys(layer.route.methods)) {
                out.add(`${m.toUpperCase()} ${prefix}${layer.route.path === '/' ? '' : layer.route.path}`);
            }
        } else if (layer.handle && layer.handle.stack) {
            walk(layer.handle.stack, prefix + mountPath(layer));
        }
    }
}

walk((app._router || app.router).stack, '');
console.log(
    [...out]
        .filter(r => r.startsWith('GET') && !r.includes(':'))
        .sort()
        .join('\n')
);
setTimeout(() => process.exit(0), 300);
