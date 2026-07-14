const { spawnSync } = require('child_process');

/**
 * child.kill() no siempre termina procesos de consola en Windows (p.ej. mysqld.exe).
 * taskkill /t mata también los procesos hijos que haya generado (relevante para
 * server.js, que a su vez lanza workers del job queue).
 */
function killProcessTree(child) {
    if (!child || child.pid === undefined) {
        return;
    }

    if (process.platform === 'win32') {
        spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    } else {
        child.kill();
    }
}

module.exports = { killProcessTree };
