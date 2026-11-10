# Pruebas de estrés – Sistema Restaurante

Este directorio contiene el **entorno de pruebas de estrés y carga** para ver cómo se comporta la aplicación con muchas peticiones simultáneas.

## Requisitos

- **Node.js** (ya usado por el proyecto).
- Aplicación y base de datos en marcha (por ejemplo `npm start` o `npm run dev` en otra terminal).
- Usuario de prueba: por defecto se usa `admin` / `admin123` (creado con `npm run create-admin`). Si usas otros usuarios, configura las variables de entorno o el archivo de entorno de Artillery.

## Herramientas

| Herramienta   | Uso principal                          | Instalación        |
|---------------|----------------------------------------|--------------------|
| **Artillery** | Escenarios complejos (login + varias rutas), reportes | `npm install` (dev) |
| **autocannon** | Prueba de carga rápida a una URL       | `npm install` (dev) |

Tras `npm install`, no hace falta instalar nada más.

## Opción 1: Artillery (recomendado para estrés completo)

Artillery simula muchos usuarios que hacen **login** y luego **varias peticiones** (dashboard, categorías, productos, mesas). Incluye fases de calentamiento, rampa y pico.

### Prueba rápida (poca carga, poco tiempo)

```bash
npm run stress:quick
```

- Duración: ~20 s, 10 peticiones/segundo.
- Sirve para comprobar que el servidor responde bien antes de una prueba larga.

### Prueba de estrés completa

```bash
npm run stress
```

- Calentamiento 30 s → rampa 60 s → carga sostenida 120 s → pico 60 s.
- Hasta ~20–40 peticiones/segundo según la fase.
- Al final verás en consola: peticiones totales, latencias (p95, p99), tasa de errores, etc.

### Usar otro entorno o credenciales

Por defecto las pruebas usan `http://localhost:3000`, usuario `admin` y contraseña `admin123` (definidos en los YAML). Para cambiar:

- **Opción rápida:** edita en `stress-tests/artillery-stress.yml` (y/o `artillery-quick.yml`) las líneas `target: "http://localhost:3000"` y `variables.username` / `variables.password`.
- **Opción con archivo de entorno:** copia `stress-tests/env-stress.example.yml` a `stress-tress/env-stress.yml`, ajusta valores y usa `-e stress-tests/env-stress.yml` (para que la URL y credenciales del archivo se apliquen, en Artillery puede ser necesario definir un *processor* que lea `$environment`; si no aplica, usa la opción de editar el YAML).

### Reporte HTML

Para generar un reporte HTML con gráficas (se guarda en `stress-tests/reports/`; esa carpeta está en `.gitignore` y no se sube a Git):

```bash
npm run stress:report
```

Se crea `stress-tests/reports/report.html` a partir del JSON (Artillery deprecó su comando `report`; usamos el script local `generate-report-html.js`). Ábrelo en el navegador. Si ya tienes un `report.json`, puedes generar solo el HTML:

```bash
node stress-tests/generate-report-html.js stress-tests/reports/report.json
```

---

## Opción 2: Script de carga rápida (autocannon)

El script `run-load.js` hace **login una vez**, obtiene el token y dispara muchas peticiones contra un endpoint protegido (por defecto `/api/dashboard/stats`).

### Uso por defecto

```bash
npm run stress:load
```

- 20 conexiones, 20 segundos.
- Usa `admin` / `admin123` y `http://localhost:3000` salvo que indiques otra cosa.

### Opciones

```bash
node stress-tests/run-load.js --url http://localhost:3000 --connections 50 --duration 30
```

- `--url`       Base URL del servidor (o `STRESS_BASE_URL`).
- `--connections`  Número de conexiones simultáneas (default: 20).
- `--duration`  Duración en segundos (default: 20).
- `--path`      Ruta a golpear (default: `/api/dashboard/stats`).
- `--public`    Probar solo la ruta pública `/auth/login` (GET), sin token.

### Variables de entorno

Puedes fijar credenciales y URL sin tocar el código:

- `STRESS_BASE_URL`  → base URL (ej. `http://localhost:3000`).
- `STRESS_USERNAME`  → usuario (ej. `admin`).
- `STRESS_PASSWORD`  → contraseña (ej. `admin123`).

---

## Qué observar durante las pruebas

- **Consola del servidor**: errores, tiempo de respuesta, uso de CPU/memoria.
- **Base de datos**: en `config/database.js` el pool tiene `connectionLimit: 10`. Con mucha carga puedes ver cola o timeouts; en ese caso valora subir el límite o escalar.
- **Métricas de Artillery/autocannon**: peticiones/segundo, latencia media y p99, tasa de errores y timeouts.

## Recomendaciones

1. Ejecutar las pruebas contra un **entorno de desarrollo o staging**, no contra producción con datos reales.
2. Tener **usuarios y tenants de prueba** creados (`npm run create-admin` y, si aplica, `npm run seed-tenants`).
3. Si la base de datos está en la misma máquina, el cuello de botella suele ser MySQL o el límite del pool; monitorea conexiones y consultas lentas.
4. Añadir `env-stress.yml` (con credenciales) al `.gitignore` si no quieres subirlo al repositorio.

---

## Suite de rendimiento (2026-11) — entorno aislado

Mide capacidad real, consultas costosas y cuellos de botella. **Solo local**: se niega a correr contra hosts
que no sean localhost o si la BD no contiene `stress` en el nombre.

```bash
# 1. BD aislada + datos de volumen (60k facturas, 12k pedidos, 3k clientes)
mysql -uroot -e "CREATE DATABASE gastroflow_stress CHARACTER SET utf8mb4"
DB_NAME=gastroflow_stress npm run migrate && DB_NAME=gastroflow_stress npm run create-admin
DB_NAME=gastroflow_stress node stress-tests/seed-stress-data.js
# plan premium para que todos los módulos respondan 200 (no 403)
mysql -uroot gastroflow_stress -e "UPDATE tenants SET plan_id=3 WHERE id=1"

# 2. App contra esa BD (terminal aparte)
DB_NAME=gastroflow_stress PORT=3100 node server.js

# 3. Verificar rutas y correr la suite (~25 min con los valores por defecto)
node stress-tests/check-endpoints.js http://localhost:3100 /api/mesas /pos/productos
node stress-tests/gf-suite.js --url http://localhost:3100 --sweep 8 --soak 60
```

`gf-suite.js` hace: barrido de ~35 endpoints (rps, p50/p99, consultas SQL y filas examinadas por petición),
escenarios mixtos (baseline / 50 / 100 / 250 conexiones / soak), CPU y RAM del proceso, conexiones MySQL y las
consultas más costosas (`performance_schema`). Informe en `stress-tests/reports/suite-<ts>.json`.

Notas: el login admite 5 intentos/min por IP (la suite inicia sesión una sola vez). Para no medir solo 429 del
limitador global, cada petición lleva un `cf-connecting-ip` aleatorio; usa `--keep-limiter` para medir con él.
`/api/*` que respondan 301/403/404 en `check-endpoints.js` no miden carga real: corrige la ruta o el plan.
