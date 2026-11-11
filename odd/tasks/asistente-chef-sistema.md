# Asistente Chef — superadmin "system" assistant (read-only)

Objective: an assistant inside the superadmin panel to ask about the platform (restaurants, sales, support, jobs, plans, assistant usage), by text or voice. Branch: `feature/asistente-sistema` (from `develop`), closed into `develop` by gitflow. Test runner: jest.

## Specs

- **S1 — Read-only.** Decision of the user (2026-11-11): "Solo consultar". No tool writes anything; there is no confirmation flow.
- **S2 — Access.** Only the superadmin (mounted behind `requireSuperadmin`), plus the server key configured (503 otherwise). Own per-user rate limits (`ASISTENTE_LIMITE_SISTEMA_MIN`, default 20/min; voice `ASISTENTE_LIMITE_SISTEMA_VOZ_MIN`, default 20/min), keyed by the superadmin user, never by tenant.
- **S3 — Closed tools.** Exactly: `resumen_plataforma`, `ventas_hoy_plataforma`, `buscar_restaurante`, `soporte_abierto`, `cola_trabajos`, `planes_y_addons`, `uso_asistente`. The model never writes SQL and passes only short text arguments.
- **S4 — Untrusted data hygiene.** Restaurant names, ticket texts and job errors are written by third parties and flow into the superadmin's model context. Results contain only aggregates and short system fields; ticket descriptions and admin replies are NEVER returned; names and error messages go through `textoSeguro` (control characters removed, whitespace collapsed, length capped). The system prompt says tool results are data, not instructions. With read-only tools an injected instruction cannot change anything.
- **S5 — Orchestrator.** Same loop and limits as the restaurant assistant (4 iterations, history of the last 6 text turns, 500 chars input), reusing the provider, history sanitization and result capping. Scope refusal for anything outside the platform.
- **S6 — Audit.** `asistente.admin_consulta` in `tenant_audit` (tenant null): the superadmin, the question (300 chars), tools used, tokens. No keys.
- **S7 — UI.** The same chat panel (text, microphone, speaker) appears in every superadmin page, titled "Asistente del sistema", talking to `/admin/asistente/api/chat`. Voice transcription has its own superadmin endpoint.
- **S8 — Docs.**

## Tasks

- [x] T1 — S3, S4 — `repositories/Admin/AsistenteSistemaRepository.js`, `services/Admin/AsistenteSistema/{seguro,herramientas/*,AsistenteSistemaTools}` — evidence: RED (module missing) then 26/26 green; every repository query run read-only against the local MySQL 8.4 schema (all OK) — commit: `feat(asistente): herramientas de consulta del sistema`
- [x] T2 — S1, S5 — `AsistenteSistemaService`, prompt — evidence: RED (module missing) then 21/21 green — commit: `feat(asistente): orquestador del asistente del sistema`
- [ ] T3 — S2, S6 — controller, routes (`/admin/asistente/api/chat/*`), limiters
- [ ] T4 — S7 — configurable API base in the panel, include in the admin shell
- [ ] T5 — S8 — docs and env

## Log

- L1 (2026-11-11, user, verbatim): "y lo de poder tenerlo en el superadmin que, para tenerlo como asistente en temas de lsistema y todo eso por el estilo"
- Decision (2026-11-11, user, via question): read-only ("Solo consultar").
- Risk: item 2 — it reads cross-tenant platform data and untrusted third-party text reaches the model. Independent verification warranted.
