# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

GastroFlow: multi-tenant SaaS (Node.js + Express + EJS + MySQL) for restaurant management — products,
tables/orders, kitchen (KDS), QR menu, inventory/recipes, cash register, invoicing (POS + electronic via
Factus), purchasing, analytics, and Wompi-based subscription billing. Full architecture docs live in
`docs/DOCUMENTACION_SISTEMA.md`, per-module docs in `docs/modulos/`, ER diagrams in `docs/diagramas/`,
OpenAPI spec in `docs/api/openapi.yaml`.

## Commands

```bash
npm start                  # migrations + create-admin + seeds + server (production-style boot)
npm run dev                 # nodemon server.js only — no migrations/seeds, DB must already be up to date
npm run migrate              # run pending SQL migrations only
npm run create-admin          # create/verify admin+superadmin (no-op if they already exist)
npm run create-test-users      # seed mesero/cocinero/cajero test users
npm run seed-tenants           # seed test tenants (database/seeds/)

npm test                    # jest (unit + integration, no watch)
npm run test:watch           # jest --watch
npm run test:coverage         # jest with coverage report (coverage/lcov-report/index.html)
npx jest tests/unit/services/FacturaService.test.js   # single file
npx jest -t "nombre del test"                          # single test by name

npm run test:e2e             # playwright (needs the app reachable at E2E_BASE_URL, default localhost:3000)
npm run test:e2e:ui           # playwright UI mode
npx playwright test tests/e2e/auth.spec.js             # single e2e file

npm run lint / lint:fix       # eslint . --ext .js
npm run format               # prettier --write "**/*.js"

npm run package              # pkg . -> dist/ (Windows exe, node18-win-x64)
npm run electron:dev          # Electron desktop prototype (see electron/README.md)
```

Jest mocks repositories with `jest.mock()` — unit tests never touch a real DB. Integration tests
(`tests/integration/`) exercise the Express `app` export via `supertest` and can hit routes backed by DB;
use `.env.test` to point them at a separate database when needed. See `tests/README.md` for the full
layout and a mocked-repository test template.

`husky` runs `lint-staged` (eslint --fix + prettier) on commit via the `prepare` script; skip only with
`HUSKY=0` if you have a real reason to.

## Architecture

Layered, Laravel-inspired despite being Express (see `docs/DOCUMENTACION_SISTEMA.md` §2 for the diagram):

```
routes/ (thin)  →  middleware (auth, tenant, planFeature)  →  app/Http/Controllers/  →  services/  →  repositories/  →  MySQL
```

- **Routing entry point is `routes/web.js`**, mounted at `/` from `app.js`. It wires every module's
  middleware chain (auth + tenant + plan-feature + permission) and requires from `routes/tenant/*.js` and
  `routes/admin/*.js`. The few files directly under `routes/` (`auth`, `onboarding`, `qr`, `qr_api`,
  `webhooks`) are the public/unauthenticated routers, also wired from `web.js`. Page JS lives in
  `public/js/modulos/` (not in `views/*/_scripts.ejs` — the old inline copies were deleted in 2026-09;
  don't reintroduce page logic inside EJS).
- Controllers live under `app/Http/Controllers/{Admin,Tenant,Public,Webhooks}/`, request validation under
  `app/Http/Requests/{Admin,Auth,Tenant}/`. Controllers orchestrate services and either `res.render(...)`
  (EJS view) or `res.json(...)` — the same controller/route commonly serves both a page and its `/api/...`
  counterpart (see the duplicate `productosRoutes`/`clientesRoutes`/etc. mounts in `routes/web.js`).
  `services/` and `repositories/` mirror that same `{Admin,Tenant,Public,Shared}` split — `Shared/` holds
  cross-cutting services (`AuthService`, `CacheService`, `RealtimeEvents`, `PdfMaker`).

- **Multi-tenant**: every tenant-scoped table carries `tenant_id`. `middleware/tenant.js`
  (`attachTenantContext`) resolves `req.tenant` from the JWT's `tenant_id` (falling back to the default
  tenant for legacy tokens), rejects/redirects if the tenant is inactive, and merges plan + per-user
  permissions into `res.locals.allowedByPlan`. Tenant, user-context and add-on lookups are cached in
  `CacheService` with a 45s TTL to avoid a DB round trip per request — `TenantCRUDService` invalidates the
  tenant cache proactively on mutation so superadmin changes feel immediate. Superadmin has no tenant and
  is routed through `costeoTenantContext` for `/costeo`, requiring an explicit `?tenant_id=` query param.

- **AuthZ is three-layered** and all three must agree for a module to be reachable:
  1. **Plan** (`tenant.plan_id` → `planes.caracteristicas` JSON) — gates whole modules
     (`requirePlanFeature` in `middleware/planFeature.js`).
  2. **Role** (admin/mesero/cocinero/cajero/superadmin, `rol_permisos`) — default permission set per role.
  3. **Per-user override** (`user_permisos`, granted from the superadmin panel) — can unlock a module a
     tenant's plan doesn't include (e.g. giving one user Analítica without Premium).
  `utils/planPermissions.js` maps each fine-grained permission slug (`productos.ver`, `caja.abrir_cerrar`,
  ...) to the plan module it requires, and `getAllowedForUser` combines plan + add-ons + user permissions
  for what a view/navbar should show. `requirePermission`/`requireRole` (`middleware/auth.js`) enforce the
  route-level checks; `restrictSuperadminToAdmin` fences superadmin out of tenant-operational routes.
  Auth itself is JWT via cookie (`auth_token`) or `Authorization: Bearer`, verified in `AuthService`.

- **Migrations**: plain numbered SQL files in `database/migrations/` (`NNN_description.sql`, zero-padded,
  currently up to `110`). `scripts/run-migrations.js` runs every `.sql` not yet recorded in the
  `schema_migrations` table, in filename order — add a new one as the next number, don't edit past ones.
  `config/env.js` validates required env vars (`JWT_SECRET` ≥ 32 chars, DB vars unless `MYSQL_URL`/
  `DATABASE_URL` is set) at process boot and throws before the app starts if they're missing/weak.

- **Realtime** is Server-Sent Events, not WebSockets: `services/Shared/RealtimeEvents.js` is an in-process
  `EventEmitter` bus (`orderCreated`, `mesaSolicitud`, ...) that feeds Cocina/Mesas/POS/Dashboard through
  the single subscription endpoint `GET /api/notifications/subscribe`. This only works for a single
  process — it won't fan out across multiple server instances/workers. Emit through the helpers
  (`RealtimeEvents.emitPedido(...)`, `emitMesasChanged(tenantId)`, `emitVentaRegistrada(tenantId)`), which
  never throw — don't call `events.emit` wrapped in a local try/catch.

- **Dates / timezone — use `utils/dateHelpers.js`, never compute "today" by hand.** DB timestamps are UTC
  and production MySQL runs in UTC, so `CURDATE()`, `NOW()`, `DATE(col)` and
  `new Date().toISOString().slice(0, 10)` all give the UTC day, which flips at 7 p.m. in Colombia (this
  caused several bugs). Use `hoyColombia()`, `sumarDias`, `sumarMeses` (month-end safe),
  `rangoUtcColombia(desde, hasta)` for `BETWEEN` on UTC columns, and the `SQL_COLOMBIA` fragments
  (`hoy`, `inicioHoyUtc`, `dia(col)`, `desdeDia()`/`hastaDia()`, `aColombia(col)`, `aUtc()`) inside SQL.
  In production (`MYSQL_URL`) mysql2 returns `DATE` columns as JS `Date` objects but locally as strings
  (`dateStrings` never applied in URL mode, see `config/database.js`): normalize with `toFechaDia()`
  before comparing or string-building.

- **Consecutive numbers** (daily order number, invoice number) come only from
  `repositories/Tenant/NumeracionRepository.js`, called with the transaction's `connection`. It locks
  the tenant row before the `MAX()` read — a bare `SELECT MAX(...) FOR UPDATE` deadlocks under
  concurrent inserts (gap locks).

- **Idempotency**: `middleware/idempotency.js` runs globally and short-circuits duplicate mutating
  requests (POST/PUT/PATCH/DELETE) that carry an `Idempotency-Key` header, caching the response for 30 min
  and returning 409 on a concurrent in-flight duplicate. Only applies when the header is present.

- **Frontend core — `public/js/core/gf.js` (`window.GF`)**, loaded on every page from the navbar partial and
  the superadmin shell (pages without them — login, registro, QR menu — include it explicitly). Use it
  instead of rewriting helpers per module: `GF.api(url, opts, mensajeError)` (+ `.get/.post/.put/.patch/
  .delete`, and `.getOr(url, porDefecto)` that never throws) for every call to our own backend — it sends
  JSON, throws `Error` with the server's `error`/`message` and `.status`, and doesn't blow up on HTML
  responses; `GF.dinero(n)` for money ("$ 12.345", no cents); `GF.escapeHtml` for ANY DB/user text put
  into HTML (innerHTML, `.html()`, template literals, `data-*` attributes); `GF.toast/alerta/exito/error/
  confirmar`; `GF.cargando(btn, bool)`; `GF.tiempoReal.on(evento, fn)` (one shared SSE connection per
  page). Raw `fetch` is only for non-JSON (blob) or third-party APIs (Wompi). Also reusable:
  `core/modules/{FormManager,SearchManager,TableManager}.js`, `core/tablas-responsive.js` (tables become
  cards on mobile automatically; opt out with `.no-stack`), `core/money-input.js`.

- **XSS**: product names, client names, order notes (writable by anonymous QR customers!) and restaurant
  names (chosen at self-registration) are untrusted. Escape them client-side with `GF.escapeHtml`, and
  embed server data in `<script>` only via `<%- jsonSeguro(data) %>` (`utils/jsonSeguro.js`, exposed as
  `app.locals.jsonSeguro`) — never `<%- JSON.stringify(...) %>`, which a `</script>` inside the data breaks.
  Don't store the JWT in localStorage (the session is the httpOnly `auth_token` cookie).

- **PDFs** are generated with `pdfmake` (`services/Shared/PdfMaker.js`, docDefinition → Buffer, no
  Chromium). Puppeteer is only used by `scripts/generate-og-image.js` (a screenshot, not a PDF) — don't
  reach for Puppeteer for report/invoice PDFs.

- **Electron desktop mode** (`electron/`, see `electron/README.md`) packages the same Express app to run
  fully offline against a local MariaDB (not MySQL — MySQL 8's Data Dictionary init was flaky under
  Electron's bundled runtime; MariaDB doesn't support `--initialize-insecure`, it uses
  `mariadb-install-db.exe` instead). `server-manager.js` runs the normal `npm start` chain as a child
  process using Electron's binary as the Node runtime. `middleware/desktopOutbox.js` and
  `services/Tenant/SyncService.js` handle pushing local actions (open order, add/edit items, tip) up to
  the cloud production instance when connectivity is available — that plumbing assumes those actions need
  no extra permission check beyond what `/mesas` already allows for any authenticated tenant user; adding
  a new synced action that *does* need a specific permission means adding the check inside `SyncService`
  itself, not in `routes/tenant/sync.js`.

- **WhatsApp bot was removed (2026-09)** for RAM consumption — don't reintroduce `whatsapp-web.js` as a
  dependency; if you see references to it in older docs/migrations they're historical
  (`091_limpiar_permisos_whatsapp.sql`, `docs/modulos/10_whatsapp_bot.md`).
