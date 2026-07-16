# Prototipo de escritorio (Electron + MariaDB local)

Rama: `feature/electron-desktop-offline`. Objetivo: empaquetar GastroFlow como
`.exe` de Windows que corre 100% local, sin depender de un servidor MySQL
externo.

## Cómo funciona

1. `electron/main.js` arranca al abrir la app.
2. `db-manager.js` inicializa (primer arranque, con `mariadb-install-db.exe`)
   y levanta un `mariadbd` local en el puerto `33306` (distinto de 3306 para
   no chocar con otro MySQL/MariaDB que ya esté corriendo en la máquina), con
   su propio `datadir` fuera del repo.
3. `server-manager.js` corre la misma cadena que `npm start`
   (migraciones → create-admin → seeds → `server.js`) como procesos hijos,
   usando el propio binario de Electron como runtime de Node
   (`ELECTRON_RUN_AS_NODE=1`) — no hace falta empaquetar Node por separado.
4. Cuando el servidor responde en `localhost:3000`, se abre la `BrowserWindow`.

El `JWT_SECRET` se genera una sola vez por instalación y se guarda en
`userData/jwt.secret` (fuera del repo, fuera del `.exe`).

## Por qué MariaDB y no MySQL

Se probó primero con la copia de MySQL 8.4.3 que trae Laragon. Le falta la
carpeta `lib/plugin` completa (incluyendo `component_reference_cache.dll`), lo
que causaba un fallo **intermitente** (aprox. 1 de cada 3 arranques) al
inicializar el Data Dictionary — reproducido de forma aislada, sin Electron
de por medio, arrancando el mismo binario varias veces seguidas sobre el
mismo `datadir`. MariaDB 12.3.2 (descarga oficial de
`downloads.mariadb.org`, ZIP portable "winx64") no tiene ese problema: se
probó arrancar 4 veces seguidas sobre el mismo `datadir` sin un solo fallo.
Es además ~2.5x más liviano (104 MB comprimido vs 249 MB de la copia de
Laragon) y usa el mismo protocolo de red que `mysql2`, así que no hizo falta
tocar ninguna query de la app.

Diferencia de arranque relevante: MariaDB **no** soporta
`mysqld --initialize-insecure` (eso es específico de MySQL 5.7+/8.x). El
primer arranque se hace con `mariadb-install-db.exe --datadir=... --default-user`.

## Cómo probarlo en desarrollo

Necesitas un binario de MariaDB portable en el disco (no lo bajamos ni lo
commiteamos automáticamente en cada corrida — usa la copia que ya está en
`resources/mysql-portable/`, o descarga el ZIP de
`https://downloads.mariadb.org/` si empiezas de cero):

```
set MYSQL_BIN_DIR=C:\laragon\www\Sistema-Restaurante-Node\resources\mysql-portable\bin
npm run electron:dev
```

`MYSQL_BIN_DIR` le dice a `db-manager.js` dónde están `mariadbd.exe` y
`mariadb-install-db.exe`. En este modo se crea un `datadir` nuevo e
independiente en `.local-desktop/mysql-data` (gitignored).

## Qué falta para un build distribuible real

- `resources/mysql-portable/` ya tiene los binarios reales de MariaDB
  (no están en git — están gitignored, solo queda el `.gitkeep`). El tamaño
  sin comprimir es de ~320 MB; vale la pena en algún momento podar
  `lib/plugin` a los motores/plugins que realmente se usan (solo InnoDB) para
  bajar el tamaño del instalador final.
- **No resuelto todavía**: sincronización offline/online, degradación de
  WhatsApp/S3/email cuando no hay internet, multi-terminal (LAN) sobre el
  mismo `mariadbd` local. Eso es la siguiente fase, fuera del alcance de este
  prototipo.
