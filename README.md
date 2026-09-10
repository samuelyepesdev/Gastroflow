# GastroFlow — Sistema de Gestión para Restaurantes

Plataforma web **multi-tenant (SaaS)** para la gestión operativa, comercial y administrativa de restaurantes, cafeterías y reposterías: productos, clientes, mesas, pedidos, cocina, **menú QR**, **modificadores/toppings**, inventario, recetas y costeo, caja y turnos, finanzas, facturación (POS y electrónica), ventas, eventos y analítica. Incluye planes de suscripción (Básico, Pro, Premium), permisos por rol y por usuario, y **cobro automático de la suscripción vía Wompi**.

> **Documentación completa:** [`docs/DOCUMENTACION_SISTEMA.md`](docs/DOCUMENTACION_SISTEMA.md) · módulos en [`docs/modulos/`](docs/modulos/README.md) · diagramas y MER en [`docs/diagramas/`](docs/diagramas/README.md).

---

## ¿Qué es este proyecto?

Aplicación Node.js (Express + EJS + MySQL) que permite:

- **Varios restaurantes (tenants)** en la misma instalación, cada uno con sus datos aislados.
- **Planes**: Básico (módulos esenciales), Pro (+ plantillas, import/export, costeo), Premium (+ analítica y predicción).
- **Permisos granulares**: por rol (admin, mesero, cocinero, cajero) y permisos extra por usuario asignados desde el panel superadmin (por ejemplo, dar Analítica o Eventos a un usuario aunque su plan no los incluya).
- **Superadmin**: crea y gestiona restaurantes, asigna planes y permisos por usuario; no opera dentro de un solo restaurante.

Está pensado para uso en local (LAN), en un servidor privado o en despliegues tipo Railway/Render.

---

## Características principales

| Módulo | Descripción | Doc |
|--------|-------------|-----|
| **Productos** | CRUD, categorías, precios por unidad/kg/libra, favorito, `pide_nota`, `mostrar_en_qr`, import masivo desde Excel. | — |
| **Modificadores / Toppings** | Grupos de opciones (salsa, extras, tamaño) por producto, precio adicional y **descuento de inventario opt-in**. | [12](docs/modulos/12_modificadores_toppings.md) |
| **Mesas y Pedidos** | Salón en tiempo real, pedidos por mesa, mover consumos, facturación parcial, liberar mesas, nota y toppings por ítem. | [03](docs/modulos/03_mesas_pedidos.md) |
| **POS** | Punto de venta sin mesa; borradores, formas de pago (efectivo/transferencia), impresión térmica vía QZ Tray. | [02](docs/modulos/02_pos.md) |
| **Menú QR** | Carta digital de autoconsumo con toppings, nota por producto, seguimiento de estado de la mesa y llamada al mesero / pedir cuenta. | [04](docs/modulos/04_menu_qr.md) |
| **Cocina (KDS)** | Cola de comandas, estados (enviado, preparando, listo, servido), agrupación por nota/toppings, SSE. | [05](docs/modulos/05_cocina.md) |
| **Inventario e Insumos** | Stock, mínimos y alertas, costo promedio ponderado, movimientos, lista de mercado, proveedores y facturas de proveedor. | [06](docs/modulos/06_inventario_insumos.md) |
| **Recetas y Costeo** | Fichas técnicas, descuento automático de insumos al vender, ingeniería de menú y márgenes. *(Pro/Premium.)* | [07](docs/modulos/07_recetas_costeo.md) |
| **Caja y Turnos** | Apertura/cierre de turno, arqueo de caja física, movimientos y auditoría de flujo de efectivo. | [08](docs/modulos/08_caja_turnos.md) |
| **Finanzas** | Ingresos vs egresos, gastos de inventario y nómina, dashboard financiero. | [09](docs/modulos/09_finanzas_analitica.md) |
| **Facturación electrónica** | Emisión a través de Factus (cola de trabajos). *(Opcional por tenant.)* | [Factus](docs/facturacion-electronica/plan-integracion-factus.md) |
| **Ventas / Eventos / Dashboard** | Listados y filtros, export a Excel, ventas por evento, resumen y gráficas. | [09](docs/modulos/09_finanzas_analitica.md) |
| **Analítica** | Ventas de los últimos 3 meses + predicción del próximo. *(Permiso o plan Premium.)* | [09](docs/modulos/09_finanzas_analitica.md) |
| **Superadmin** | Multi-tenant: crea restaurantes, asigna planes y permisos por usuario, bloquea locales. | [11](docs/modulos/11_superadmin.md) |
| **Suscripción (Wompi)** | Cobro mensual automático de la suscripción de cada tenant; suspensión y reactivación automáticas. | [13](docs/modulos/13_suscripcion_wompi.md) |
| **Permisos** | Por restaurante y usuario: secciones con checkbox "marcar todos"; el plan o un permiso individual desbloquean un módulo. | [Roles](docs/ROLES_Y_PERMISOS.md) |

**Tiempo real:** notificaciones vía Server-Sent Events (`GET /api/notifications/subscribe`) alimentadas por un bus de eventos en proceso (`services/Shared/RealtimeEvents.js`).

> El **bot de WhatsApp** fue **retirado (2026-09)** por consumo de RAM. Ver [`docs/modulos/10_whatsapp_bot.md`](docs/modulos/10_whatsapp_bot.md).

---

## Uso del proyecto

### Requisitos

- **Node.js** v18 (recomendado)
- **MySQL** 5.7 o superior
- Git (opcional)

### Instalación

1. **Clonar o descargar** el repositorio y entrar en la carpeta del proyecto.

2. **Crear la base de datos** (si no existe):
   ```sql
   CREATE DATABASE IF NOT EXISTS restaurante;
   ```

3. **Instalar dependencias**:
   ```bash
   npm install
   ```

4. **Variables de entorno** (opcional; hay valores por defecto en `config/database.js`):
   - Crear `.env` en la raíz con, por ejemplo:
   ```env
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=tu_password
   DB_NAME=restaurante
   PORT=3000
   JWT_SECRET=cambiar_en_produccion
   JWT_EXPIRES_IN=24h
   ```
   - Para el **superadmin** (solo se crean si no existen; en deploy no se resetean):
     - `SUPERADMIN_USERNAME`, `SUPERADMIN_PASSWORD`, `SUPERADMIN_EMAIL`, `SUPERADMIN_NOMBRE`
   - Para el **admin del tenant principal** (mismo criterio):
     - `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_EMAIL`, `ADMIN_NOMBRE`

5. **Iniciar**:
   ```bash
   npm start
   ```
   Este comando ejecuta en orden: migraciones (solo las pendientes), creación de admin/superadmin (solo si no existen) y arranque del servidor.

6. **Acceso**:
   - Local: `http://localhost:3000`
   - Misma red (LAN): `http://TU_IP:3000` (el servidor escucha en `0.0.0.0`)

### Primer uso

1. Iniciar sesión como **superadmin** (p. ej. `superadmin` / `superadmin123` si no cambiaste las variables).
2. En **Restaurantes** crear o elegir un restaurante y asignarle un plan.
3. En **Permisos** elegir el restaurante, un usuario y marcar los permisos por sección (incluidos Eventos y Analítica si quieres darlos sin plan Premium).
4. Para operar como **admin** de un restaurante, iniciar sesión con un usuario de ese tenant (p. ej. `admin` / `admin123` en el tenant principal).

### Scripts disponibles

| Comando | Descripción |
|---------|-------------|
| `npm start` | Migraciones + create-admin (solo si no existen) + servidor |
| `npm run dev` | Servidor con nodemon (sin migraciones ni create-admin) |
| `npm run migrate` | Solo ejecutar migraciones |
| `npm run create-admin` | Crear/verificar admin y superadmin (no sobrescribe si ya existen) |
| `npm run create-test-users` | Crear usuarios de prueba (mesero, cocinero, cajero) |
| `npm run seed-tenants` | Seed de tenants de prueba (ver `database/seeds/`) |
| `npm run build` | Generar ejecutable con pkg (ver `package.json`) |

**Nota:** En producción, `create-admin` solo **crea** los usuarios admin y superadmin si no existen; **no** actualiza contraseñas en cada deploy. Para forzar actualización desde `.env`, usar `CREATE_ADMIN_OVERWRITE=true`.

---

## Estructura del proyecto

```
├── config/           # Base de datos
├── database/
│   ├── migrations/   # SQL versionados (se ejecutan en orden al hacer migrate/start)
│   └── seeds/        # Datos de prueba (tenants, etc.)
├── middleware/       # auth, tenant, planFeature
├── public/           # CSS, JS, uploads
├── repositories/     # Acceso a datos (productos, clientes, permisos, etc.)
├── routes/           # Rutas por módulo (auth, productos, mesas, cocina, facturas, ventas, eventos, analitica, costeo, admin)
├── services/         # Lógica de negocio (Auth, Tenant, Analitica, Costeo, etc.)
├── utils/            # Constantes, planPermissions
├── views/             # Plantillas EJS (layout, navbar, módulos, admin)
├── scripts/
│   ├── run-migrations.js   # Aplica solo migraciones pendientes (detecta archivos en migrations/)
│   ├── create-admin.js    # Crea admin/superadmin solo si no existen
│   ├── create-test-users.js
│   └── seed-tenants-test.js
├── server.js         # Entrada de la aplicación
├── package.json
└── README.md
```

---

## Especificaciones técnicas

### Stack

| Capa | Tecnología |
|------|------------|
| **Runtime** | Node.js v18 (recomendado) |
| **Framework web** | Express 4.x |
| **Motor de vistas** | EJS 3.x |
| **Base de datos** | MySQL 5.7+ (driver `mysql2` con pool de conexiones) |
| **Autenticación** | JWT (jsonwebtoken), cookie `auth_token` + header `Authorization: Bearer` |
| **Contraseñas** | bcrypt |
| **Validación** | express-validator |
| **Archivos** | multer (subida de imágenes); exceljs (import/export Excel); `@aws-sdk/client-s3` (R2/S3 opcional para logos) |
| **PDFs** | Puppeteer v24 vía `services/Shared/PdfBrowser.js` (Chromium de un solo uso, lazy + kill + watchdog) |
| **Tiempo real** | Server-Sent Events + `services/Shared/RealtimeEvents.js` (EventEmitter en proceso) |
| **Pagos** | Wompi (cobro recurrente de la suscripción del tenant), opcional |
| **Observabilidad** | Winston (logs), Sentry (opcional vía `SENTRY_DSN`) |
| **Variables de entorno** | dotenv; validación al arranque en `config/env.js` |

### Arquitectura

- **Patrón**: MVC + capa de servicios + repositorios. Rutas delgadas; lógica en servicios; acceso a datos en repositorios.
- **Multi-tenant**: Tablas con `tenant_id`; middleware `attachTenantContext` inyecta `req.tenant` según el usuario; superadmin sin tenant.
- **Autorización**: Roles (admin, mesero, cocinero, cajero, superadmin), permisos por rol (`rol_permisos`) y permisos extra por usuario (`user_permisos`). Middleware `requirePermission`, `requireRole`, `requirePlanFeature` (plan o permiso desbloquea módulo).
- **Planes**: Tabla `planes` con `caracteristicas` (JSON); `tenant.plan_id`; `planPermissions.js` mapea permisos a módulos y comprueba si el plan incluye el módulo.

### Base de datos

- **Motor**: MySQL. Conexión vía `config/database.js` (pool); soporta `MYSQL_URL`/`DATABASE_URL` o `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`.
- **Migraciones**: SQL en `database/migrations/`; el script `run-migrations.js` detecta todos los `.sql`, los ordena por nombre y ejecuta solo los no registrados en `schema_migrations`.
- **Tablas principales**: `usuarios`, `roles`, `permisos`, `rol_permisos`, `user_permisos`, `tenants`, `planes`, `productos`, `clientes`, `mesas`, `pedidos`, `pedido_items`, `facturas`, `eventos`, `configuracion_impresion`, etc.

### API y rutas

- **Autenticación**: login (cookie + JSON), logout, cambio de contraseña.
- **Rutas de página**: HTML vía EJS (productos, clientes, mesas, cocina, facturas, ventas, dashboard, configuracion, costeo, analitica, eventos, admin/tenants, admin/planes, admin/permisos).
- **Rutas API**: bajo prefijos como `/api/productos`, `/api/clientes`, `/api/mesas`, `/api/cocina`, `/api/facturas`, `/api/dashboard` para peticiones JSON (listados, crear, actualizar, eliminar).

### Frontend

- **Vistas**: EJS con `layout` y `partials` (navbar). Sin framework JS; vanilla JavaScript en el cliente.
- **Estilos**: Bootstrap 5, Bootstrap Icons.
- **UX**: SweetAlert2 para alertas y confirmaciones; formularios con validación en servidor.

### Despliegue y entorno

- **Puerto**: `PORT` (por defecto 3000). Servidor escucha en `0.0.0.0` para acceso en LAN.
- **Build**: `npm run build` genera ejecutable con `pkg` (target `node18-win-x64`); assets: `views/**/*`, `public/**/*`, `node_modules/ejs/**/*`.

---

## Documentación adicional

- **`docs/DOCUMENTACION_SISTEMA.md`** – Documentación técnica general (stack, arquitectura por capas, multi-tenant, migraciones).
- **`docs/modulos/`** – Un documento por módulo (POS, Mesas, Menú QR, Cocina, Inventario, Recetas/Costeo, Caja, Finanzas, Superadmin, Modificadores, Suscripción Wompi).
- **`docs/diagramas/`** – MER exhaustivo, casos de uso, diagrama de actividad y diagramas de flujo algorítmicos.
- **`docs/api/openapi.yaml`** – Especificación OpenAPI de la API REST.
- **`README-SETUP.md`** – Instalación detallada y solución de problemas.
- **`docs/DESPLIEGUE.md`** / **`docs/RAILWAY-PASOS.md`** – Despliegue en la nube.
- **`docs/ROLES_Y_PERMISOS.md`** – Roles (admin, mesero, cocinero, cajero) y lista de permisos.
- **`docs/COSTEO-FLUJO-REFERENCIA.md`** – Flujo de costeo y recetas.
- **`docs/facturacion-electronica/plan-integracion-factus.md`** – Integración de facturación electrónica (Factus).

---

## Seguridad

- Cambiar **JWT_SECRET** en producción.
- Cambiar contraseñas de admin y superadmin tras el primer acceso.
- No subir `.env` al repositorio.
- Usar HTTPS en producción y restringir acceso a la base de datos.

---

## Licencia y soporte

Para dudas o incidencias, abrir un issue o contactar al equipo del proyecto.
