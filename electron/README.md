# Prototipo de escritorio (Electron + MySQL local)

Rama: `feature/electron-desktop-offline`. Objetivo: empaquetar GastroFlow como
`.exe` de Windows que corre 100% local, sin depender de un servidor MySQL
externo.

## Cómo funciona

1. `electron/main.js` arranca al abrir la app.
2. `db-manager.js` inicializa (primer arranque) y levanta un `mysqld` local en
   el puerto `33060` (distinto de 3306 para no chocar con otro MySQL/MariaDB
   que ya esté corriendo en la máquina), con su propio `datadir` fuera del
   repo.
3. `server-manager.js` corre la misma cadena que `npm start`
   (migraciones → create-admin → seeds → `server.js`) como procesos hijos,
   usando el propio binario de Electron como runtime de Node
   (`ELECTRON_RUN_AS_NODE=1`) — no hace falta empaquetar Node por separado.
4. Cuando el servidor responde en `localhost:3000`, se abre la `BrowserWindow`.

El `JWT_SECRET` se genera una sola vez por instalación y se guarda en
`userData/jwt.secret` (fuera del repo, fuera del `.exe`).

## Cómo probarlo en desarrollo

Necesitas un binario de MySQL/MariaDB portable en el disco (no lo bajamos ni
lo commiteamos automáticamente). Para probar en esta máquina, Laragon ya trae
uno:

```
set MYSQL_BIN_DIR=C:\laragon\bin\mysql\mysql-8.4.3-winx64\bin
npm run electron:dev
```

`MYSQL_BIN_DIR` le dice a `db-manager.js` dónde están `mysqld.exe` y
`mysql.exe`. En este modo se crea un `datadir` nuevo e independiente en
`.local-desktop/mysql-data` (gitignored), así que no toca la base de datos
que uses normalmente con Laragon.

## Qué falta para un build distribuible real

- **Poblar `resources/mysql-portable/bin/`** con los binarios que se
  empaquetarán dentro del instalador (no están en git — carpeta vacía con
  `.gitkeep`). Opciones:
  - MySQL Community Server, distribución ZIP "no install" (licencia GPLv2,
    redistribución permitida, pero hay que incluir el aviso de licencia en el
    instalador).
  - MariaDB Server portable (también GPLv2, suele ser más liviano).
- El paso `npm run electron:build` (electron-builder, target NSIS) todavía no
  se ha ejecutado de punta a punta con binarios reales — falta validar tamaño
  final del instalador y que el `datadir` se cree correctamente en la carpeta
  `userData` de una instalación limpia.
- **No resuelto todavía**: sincronización offline/online, degradación de
  WhatsApp/S3/email cuando no hay internet, multi-terminal (LAN) sobre el
  mismo `mysqld` local. Eso es la siguiente fase, fuera del alcance de este
  prototipo.
