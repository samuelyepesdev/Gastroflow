# Reservas V1 + temporada navideña

Objective: reservations module (no deposit) and December season tooling, using the "Cloche" branding.
Branch: feat/reservas-v1 · Delivery: ask-on-risk · Test runner: jest (`npx jest <file>`)

## Specs
- S1: "reservas v1" — reservations V1 without online deposit (Wompi deposit deferred to January).
- S2: Public reservation page per restaurant (no login, token-scoped, rate-limited, honeypot, Ley 1581 consent evidence).
- S3: Internal panel: calendar/day list, manual booking, status changes (pendiente, confirmada, sentada, cancelada, no_show), WhatsApp `wa.me` confirmation link, copy public link.
- S4: Capacity-based availability (max simultaneous guests per slot), overbooking prevented inside a transaction.
- S5: "trabajamos lo de diciembre de la mano, plantillas y demas" — seasonal tooling: product/combo validity dates and a Christmas template (combo + promotion).
- S6: "usando el branding creado y demas respetando eso" — all new UI uses `public/css/core/brand.css` tokens (Tinta, Coral, Crema, Arena, Gris; Montserrat + Poppins), no loose brand hex.
- S7: Permissions only via `utils/permisosCatalogo.js`; errors via `utils/errors.js`; dates via `utils/dateHelpers.js`; `GF.api`/`GF.escapeHtml` on the frontend.

## Tasks
- T1 (S1,S3,S4,S7) Migration 129 + ReservaRepository + ReservaService + tests — route: inline — status: done (jest 19 tests) — commit ef3db15
- T2 (S3,S6,S7) Panel routes/controller/view/js/css + permissions + navbar — route: inline — status: done — commit f6fffdd
- T3 (S2,S6) Public page /reservar/:token — route: inline — status: done — commit e3ce7c9
- T4 (S5,S6) Migration 130 producto_vigencia (daily cron flips `disponible`, catalog untouched) + /temporada page with 4 promo templates — route: inline — status: done in code, pending commit; migrations 129/130 NOT yet run (local MySQL was down)
- T5 docs/modulos/21_reservas.md, 22_temporada.md + README index — route: inline — status: done

## Log
- L1 (2026-11-18): "reservas v1, y pues trabajamos lo de diciembre de la mano, plantillas y demas, pero recuerda usando  el branding creado y demas respetando eso"
