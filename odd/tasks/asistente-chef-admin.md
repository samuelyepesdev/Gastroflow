# Asistente Chef — superadmin module

Objective: one page in the superadmin panel (`/admin/asistente`) to see and manage the assistant across restaurants. Branch: `feature/asistente-admin` (from `develop`), closed into `develop` by gitflow (no PR, as the user asked for the previous feature). Test runner: jest; page checked in the browser pane.

## Specs

- **S1 — Overview.** Table of every active restaurant: name, add-on on/off, assistant name, users with access, and last-30-days usage (commands, errors, tokens, last use). Usage is aggregated from `tenant_audit` (`asistente.comando`); the raw user texts are NOT shown (privacy).
- **S2 — Server status.** A banner shows whether `GROQ_API_KEY` is configured and which model is in use. Never the key.
- **S3 — Add-on switch.** Turn the `asistente` add-on on/off per restaurant, reusing `AddonService.addToTenant/removeFromTenant` (cache invalidation + audit already there). If the add-on does not exist in the catalog (migration 128 not run) the call fails with a clear message.
- **S4 — Name.** Edit the assistant name per restaurant (upsert in `asistente_config`). Valid names are 1–24 chars of letters, digits, space, `.`, `'`, `-` (same rule as `sanitizarNombre`); anything else is rejected, not silently changed. Audited.
- **S5 — Users.** Per restaurant, list its users with their effective access to `asistente.usar` and whether it comes from role/plan, a granted exception or a denied exception. The superadmin can set a user to **estándar** (no exception), **conceder** or **denegar**, preserving the user's other exceptions. The user must belong to the restaurant in the URL (404 otherwise). Premium/Definitivo admins are flagged because their exceptions never apply. Audited.
- **S6 — Access.** All routes are superadmin-only (mounted behind `requireSuperadmin`); nothing here is reachable by tenant users. Tenant ids and user ids are integers validated server-side.
- **S7 — Navigation and docs.** Sidebar entry "Asistente" in the admin menu; `docs/modulos/20_asistente_chef.md` documents the module.

## Tasks

- [ ] T1 — S1, S2, S3, S4, S5 — inline — `repositories/Admin/AsistenteAdminRepository.js`, `services/Admin/AsistenteAdminService.js` — commit: —
- [ ] T2 — S6, S7 — inline — `app/Http/Controllers/Admin/AsistenteController.js`, `routes/admin/asistente.js`, mount in `routes/web.js`, sidebar item in `utils/adminSections.js` — commit: —
- [ ] T3 — S1–S5 UI — inline — `views/admin/asistente/index.ejs`, `public/js/admin/asistente.js` — commit: —
- [ ] T4 — S7 — inline — docs — commit: —

## Log

- L1 (2026-11-11, user, verbatim): "me gustaria entonces que desde el super admin existan un modulo donde se puede ver ese o tambien tenerlo por defecto para el superadministrador"
- Decision (2026-11-11, user, via question): build the admin module (recommended option); the superadmin using the assistant itself is NOT part of this feature (the superadmin has no restaurant and is fenced out of tenant-operational routes).
- Risk: item 2 (permissions: it writes `user_permisos` exceptions and add-ons) — superadmin-only, tenant-scoped, audited; an independent check is warranted at the end.
