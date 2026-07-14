const { spawn } = require('child_process');
const path = require('path');
const net = require('net');
const { killProcessTree } = require('./process-utils');

const ROOT = path.join(__dirname, '..');

function runScript(relPath, env) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [path.join(ROOT, relPath)], {
            env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ...env },
            stdio: 'inherit'
        });
        child.on('exit', code => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`${relPath} salió con código ${code}`));
            }
        });
    });
}

function waitForHttp(port, timeoutMs = 30000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
        const attempt = () => {
            const socket = net.createConnection({ port, host: '127.0.0.1' }, () => {
                socket.end();
                resolve();
            });
            socket.on('error', () => {
                socket.destroy();
                if (Date.now() - start > timeoutMs) {
                    reject(new Error(`Timeout esperando a que el servidor escuche en el puerto ${port}`));
                } else {
                    setTimeout(attempt, 500);
                }
            });
        };
        attempt();
    });
}

class AppServer {
    constructor(env) {
        this.env = env;
        this.process = null;
    }

    async bootstrap() {
        await runScript('scripts/run-migrations.js', this.env);
        await runScript('scripts/create-admin.js', this.env);
        await runScript('scripts/seed-doc-types.js', this.env);
        await runScript('scripts/seed-temas-parametros.js', this.env);
    }

    async start() {
        await this.bootstrap();

        this.process = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
            env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ...this.env },
            stdio: 'inherit'
        });

        this.process.on('exit', code => {
            if (code !== null && code !== 0) {
                console.error(`server.js se detuvo inesperadamente (código ${code})`);
            }
        });

        await waitForHttp(Number(this.env.PORT) || 3000);
    }

    stop() {
        if (this.process) {
            killProcessTree(this.process);
            this.process = null;
        }
    }
}

module.exports = { AppServer };
