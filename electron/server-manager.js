const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { killProcessTree } = require('./process-utils');

const ROOT = path.join(__dirname, '..');

// stdio:'inherit' no sirve cuando la app se lanza sin consola (doble clic en
// el .exe empaquetado): en ese caso el proceso padre no tiene un handle de
// stdout/stderr válido para heredar, así que la salida (incluyendo errores
// fatales) desaparece en silencio. Para poder diagnosticar arranques
// fallidos, capturamos la salida de cada script hijo y la escribimos a un
// archivo en userData, además de reenviarla al proceso padre cuando sí hay
// consola.
let logStream = null;
function getLogStream(logDir) {
    if (!logStream && logDir) {
        fs.mkdirSync(logDir, { recursive: true });
        logStream = fs.createWriteStream(path.join(logDir, 'electron-bootstrap.log'), { flags: 'a' });
    }
    return logStream;
}

function spawnCaptured(command, args, { env, logDir }) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            env,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        const stream = getLogStream(logDir);
        let tail = '';
        const onData = chunk => {
            process.stdout.write(chunk);
            if (stream) {
                stream.write(chunk);
            }
            tail = (tail + chunk.toString()).slice(-4000);
        };
        child.stdout.on('data', onData);
        child.stderr.on('data', onData);

        child.on('error', err => reject(err));
        child.on('exit', code => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`${args[0]} salió con código ${code}${tail ? `\n\n${tail}` : ''}`));
            }
        });
    });
}

function runScript(relPath, env, logDir) {
    return spawnCaptured(process.execPath, [path.join(ROOT, relPath)], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ...env },
        logDir
    });
}

function waitForHttp(port, timeoutMs = 30000, getEarlyExit = () => null) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
        const attempt = () => {
            const earlyExit = getEarlyExit();
            if (earlyExit) {
                reject(earlyExit);
                return;
            }
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
    constructor(env, logDir) {
        this.env = env;
        this.logDir = logDir;
        this.process = null;
        this.stopping = false;
    }

    async bootstrap() {
        await runScript('scripts/run-migrations.js', this.env, this.logDir);

        if (!this.env.SYNC_API_URL) {
            // Desktop puramente local (sin vínculo a producción): mantiene el
            // flujo original de crear admin/superadmin y catálogos base desde
            // cero, igual que antes de que existiera la sincronización.
            await runScript('scripts/create-admin.js', this.env, this.logDir);
            await runScript('scripts/seed-doc-types.js', this.env, this.logDir);
            await runScript('scripts/seed-temas-parametros.js', this.env, this.logDir);
        }
        // Si SYNC_API_URL está seteado, los datos reales (usuarios, mesas,
        // productos) llegan por /desktop/link + pull, no por seeds genéricos.
        // Sembrar aquí crearía una cuenta admin/admin123 "fantasma" con
        // acceso además del usuario real del tenant.
    }

    async start() {
        await this.bootstrap();

        this.process = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
            env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ...this.env },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        const stream = getLogStream(this.logDir);
        let tail = '';
        const onData = chunk => {
            process.stdout.write(chunk);
            if (stream) {
                stream.write(chunk);
            }
            tail = (tail + chunk.toString()).slice(-4000);
        };
        this.process.stdout.on('data', onData);
        this.process.stderr.on('data', onData);

        let earlyExit = null;
        this.process.on('exit', code => {
            if (!this.stopping && code !== null && code !== 0) {
                const message = `server.js se detuvo inesperadamente (código ${code})${tail ? `\n\n${tail}` : ''}`;
                console.error(message);
                earlyExit = new Error(message);
            }
        });

        await waitForHttp(Number(this.env.PORT) || 3000, 30000, () => earlyExit);
    }

    stop() {
        if (this.process) {
            this.stopping = true;
            killProcessTree(this.process);
            this.process = null;
        }
    }
}

module.exports = { AppServer };
