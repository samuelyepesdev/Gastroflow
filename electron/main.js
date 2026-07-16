const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { LocalDatabase } = require('./db-manager');
const { AppServer } = require('./server-manager');

// El proceso GPU de Chromium falla de forma intermitente en algunas laptops
// (más frecuente con GPU dual/Optimus: NVIDIA + Intel) y Electron aborta todo
// el proceso principal sin ventana ni diálogo de error ("GPU process isn't
// usable. Goodbye."). disableHardwareAcceleration() solo no alcanza: Chromium
// sigue intentando levantar el proceso GPU en su propio sandbox para
// consultas de capacidades, y ese sandbox es lo que falla en esta máquina.
// Confirmado por prueba manual: sin --disable-gpu-sandbox el crash persiste
// incluso con disableHardwareAcceleration(). Esta app solo carga contenido
// local (localhost), así que relajar el sandbox del proceso GPU es aceptable.
//
// IMPORTANTE: NO agregar --disable-software-rasterizer aquí. Ese switch
// elimina el renderizador de software (SwiftShader) que Chromium usa como
// respaldo cuando la aceleración por hardware está desactivada. Sin GPU y
// sin ese respaldo no hay nada con qué pintar la ventana: el servidor
// arranca bien y la página carga (HTTP 200), pero queda en blanco porque
// nada se renderiza. Confirmado reproduciendo el problema con el switch
// puesto y viéndolo desaparecer al quitarlo.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu-sandbox');
// El proceso renderer (no el de GPU) también crasheaba en esta máquina con
// STATUS_BREAKPOINT (exitCode -2147483645), detectado vía render-process-gone
// después de que loadURL fallara con ERR_FAILED. El sandbox del renderer de
// Chromium es lo que dispara ese crash aquí (común en máquinas con hardware
// o software de seguridad que interfiere con el sandboxing de Chromium). Esta
// app solo carga contenido local propio (localhost), nunca contenido web
// externo no confiable, así que desactivar el sandbox por completo es un
// trade-off aceptable.
app.commandLine.appendSwitch('no-sandbox');

const APP_PORT = 3000;
const DB_PORT = 33306; // distinto de 3306 (otro MySQL local) y de 33060 (puerto por defecto del plugin X de MySQL)

let mainWindow;
let localDb;
let appServer;
// Decidido en startBackend(): '/desktop/link' si este equipo está en modo
// sync (GASTROFLOW_SYNC_API_URL seteado) y todavía no se vinculó con
// producción; '/' en cualquier otro caso (flujo local normal de siempre).
let initialPath = '/';

function getUserDataDir() {
    return app.isPackaged ? app.getPath('userData') : path.join(__dirname, '..', '.local-desktop');
}

// El proceso principal de Electron no tiene consola visible cuando se lanza
// por doble clic (sin terminal adjunto), así que un console.error() aquí
// desaparece en silencio. server-manager.js ya captura la salida de los
// procesos hijos (server.js, scripts) en este mismo archivo; esta función
// permite que errores del propio proceso principal (ventana, renderer) caigan
// en el mismo lugar en vez de perderse.
function logToFile(message) {
    try {
        fs.appendFileSync(path.join(getUserDataDir(), 'electron-bootstrap.log'), `[main] ${message}\n`);
    } catch {
        // Si ni siquiera se puede escribir el log, no hay más respaldo posible.
    }
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
        JWT_SECRET: getOrCreateJwtSecret(userDataDir),
        // server.js corre empaquetado dentro de app.asar (solo lectura); cualquier
        // directorio que necesite escritura en tiempo de ejecución (ej. PDFs de
        // job_queue) debe apuntar a userData en vez de a __dirname.
        STORAGE_DIR: path.join(userDataDir, 'storage'),
        // Sync con producción (ver DesktopSyncService): inactivo por completo si
        // GASTROFLOW_SYNC_API_URL no está seteado en el entorno de esta máquina.
        ...(process.env.GASTROFLOW_SYNC_API_URL
            ? {
                  SYNC_API_URL: process.env.GASTROFLOW_SYNC_API_URL,
                  SYNC_TOKEN_FILE: path.join(userDataDir, 'production-session.json')
              }
            : {})
    };

    // Si este equipo está en modo sync y todavía no existe un archivo de
    // sesión de producción (nunca se vinculó), arranca en la pantalla de
    // vinculación en vez del login local normal.
    if (env.SYNC_API_URL && !fs.existsSync(env.SYNC_TOKEN_FILE)) {
        initialPath = '/desktop/link';
    }

    appServer = new AppServer(env, userDataDir);
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
    // 127.0.0.1 en vez de 'localhost': evita que la resolución DNS propia de
    // Chromium (independiente de la de Node) intente IPv6 (::1) primero y
    // demore o falle la navegación inicial en máquinas donde eso no responde.
    mainWindow.loadURL(`http://127.0.0.1:${APP_PORT}${initialPath}`).catch(err => {
        logToFile(`Error cargando la interfaz (loadURL): ${err.message}`);
    });
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        logToFile(`did-fail-load: código=${errorCode} desc=${errorDescription} url=${validatedURL}`);
    });
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
        const detail = err.message.length > 1500 ? `${err.message.slice(0, 1500)}\n[...]` : err.message;
        dialog.showErrorBox(
            'Error al iniciar GastroFlow',
            `${detail}\n\nDetalle completo en: ${path.join(getUserDataDir(), 'electron-bootstrap.log')}`
        );
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

app.on('render-process-gone', (event, webContents, details) => {
    logToFile(`render-process-gone: ${JSON.stringify(details)}`);
});

process.on('uncaughtException', err => {
    logToFile(`Excepción no capturada en el proceso principal: ${err.stack || err.message}`);
});
process.on('unhandledRejection', reason => {
    logToFile(`Promesa rechazada sin manejar en el proceso principal: ${reason}`);
});
