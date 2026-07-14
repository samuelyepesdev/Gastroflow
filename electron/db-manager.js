const { spawn, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');
const mysql = require('mysql2/promise');
const { killProcessTree } = require('./process-utils');

function resolveBinDir() {
    if (process.env.MYSQL_BIN_DIR) {
        return process.env.MYSQL_BIN_DIR;
    }
    const packagedDir = path.join(process.resourcesPath || '', 'mysql-portable', 'bin');
    if (fs.existsSync(packagedDir)) {
        return packagedDir;
    }
    throw new Error(
        'No se encontró un binario de MySQL/MariaDB local. ' +
            'Define MYSQL_BIN_DIR (desarrollo) o coloca los binarios portables en resources/mysql-portable/bin (empaquetado). ' +
            'Ver electron/README.md.'
    );
}

function waitForPort(port, host, timeoutMs = 30000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
        const attempt = () => {
            const socket = net.createConnection({ port, host }, () => {
                socket.end();
                resolve();
            });
            socket.on('error', () => {
                socket.destroy();
                if (Date.now() - start > timeoutMs) {
                    reject(new Error(`Timeout esperando a que MySQL escuche en ${host}:${port}`));
                } else {
                    setTimeout(attempt, 500);
                }
            });
        };
        attempt();
    });
}

class LocalDatabase {
    constructor({ dataDir, port, database = 'restaurante', binDir }) {
        this.dataDir = dataDir;
        this.port = port;
        this.database = database;
        this.binDir = binDir || resolveBinDir();
        this.process = null;
    }

    get mysqldPath() {
        return path.join(this.binDir, 'mysqld.exe');
    }

    isInitialized() {
        return fs.existsSync(path.join(this.dataDir, 'mysql'));
    }

    initialize() {
        fs.mkdirSync(this.dataDir, { recursive: true });
        execFileSync(this.mysqldPath, [`--datadir=${this.dataDir}`, '--initialize-insecure'], {
            stdio: 'inherit'
        });
    }

    async start() {
        if (!this.isInitialized()) {
            this.initialize();
        }

        this.process = spawn(
            this.mysqldPath,
            [
                `--datadir=${this.dataDir}`,
                `--port=${this.port}`,
                '--bind-address=127.0.0.1',
                `--socket=${path.join(this.dataDir, 'mysql.sock')}`
            ],
            { stdio: 'inherit' }
        );

        this.process.on('exit', code => {
            if (code !== null && code !== 0) {
                console.error(`mysqld se detuvo inesperadamente (código ${code})`);
            }
        });

        await waitForPort(this.port, '127.0.0.1');
        await this.ensureDatabase();
    }

    async ensureDatabase(retries = 10) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const connection = await mysql.createConnection({
                    host: '127.0.0.1',
                    port: this.port,
                    user: 'root',
                    password: ''
                });
                await connection.query(`CREATE DATABASE IF NOT EXISTS \`${this.database}\` CHARACTER SET utf8mb4;`);
                await connection.end();
                return;
            } catch (err) {
                if (attempt === retries) {
                    throw err;
                }
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
    }

    stop() {
        if (this.process) {
            killProcessTree(this.process);
            this.process = null;
        }
    }
}

module.exports = { LocalDatabase };
