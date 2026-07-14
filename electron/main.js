const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { LocalDatabase } = require('./db-manager');
const { AppServer } = require('./server-manager');

const APP_PORT = 3000;
const DB_PORT = 33060; // puerto distinto al 3306 por defecto para no chocar con otro MySQL local

let mainWindow;
let localDb;
let appServer;

function getUserDataDir() {
    return app.isPackaged ? app.getPath('userData') : path.join(__dirname, '..', '.local-desktop');
}

function getOrCreateJwtSecret(userDataDir) {
    const secretFile = path.join(userDataDir, 'jwt.secret');
    if (fs.existsSync(secretFile)) {
        return fs.readFileSync(secretFile, 'utf8').trim();
    }
    fs.mkdirSync(userDataDir, { recursive: true });
    const secret = crypto.randomBytes(64).toString('hex');
    fs.writeFileSync(secretFile, secret, { mode: 0o600 });
    return secret;
}

async function startBackend() {
    const userDataDir = getUserDataDir();

    localDb = new LocalDatabase({
        dataDir: path.join(userDataDir, 'mysql-data'),
        port: DB_PORT
    });
    await localDb.start();

    const env = {
        NODE_ENV: 'production',
        PORT: String(APP_PORT),
        DB_HOST: '127.0.0.1',
        DB_PORT: String(DB_PORT),
        DB_USER: 'root',
        DB_PASSWORD: '',
        DB_NAME: 'restaurante',
        JWT_SECRET: getOrCreateJwtSecret(userDataDir)
    };

    appServer = new AppServer(env);
    await appServer.start();
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true
        }
    });
    mainWindow.loadURL(`http://localhost:${APP_PORT}`);
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function stopBackend() {
    appServer?.stop();
    localDb?.stop();
}

app.whenReady().then(async () => {
    try {
        await startBackend();
        createWindow();
    } catch (err) {
        dialog.showErrorBox('Error al iniciar GastroFlow', err.message);
        stopBackend();
        app.quit();
    }
});

app.on('window-all-closed', () => {
    stopBackend();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', stopBackend);
