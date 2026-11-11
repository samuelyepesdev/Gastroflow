# Superadmin assistant — richer sales analytics

Objective: let the superadmin ask things like "how much has been sold", "which restaurant sells the most", "this month vs last", "best-selling products", by any period. Branch: `feature/asistente-sistema-ventas` (from `develop`), closed into `develop` by gitflow. Read-only, same safety posture as the system assistant (aggregates only, third-party text cleaned).

## Specs

- **S1 — Periods, server-side.** The model passes `periodo` (`hoy`, `ayer`, `ultimos_7_dias`, `este_mes`, `mes_pasado`, `este_anio`, `historico`) or two ISO dates `desde`/`hasta`; the server resolves them in Colombia time (`utils/dateHelpers`), validates real dates, `desde <= hasta`, and caps custom ranges at 400 days. Every result states the resolved range and the previous equivalent range used for comparison (none for `historico`).
- **S2 — `ventas_plataforma`** (replaces `ventas_hoy_plataforma`): total, invoices, average ticket, restaurants with sales, ranking (top 10, best restaurant first), payment mix (cash/transfer/voucher), event sales reported separately (normal sales exclude `evento_aparte = 1`), and the variation versus the previous period.
- **S3 — `ventas_restaurante`**: same figures for one restaurant by name (several matches → ask which), best day, top 5 products, and variation versus the previous period.
- **S4 — `productos_mas_vendidos`**: top 10 products by units and revenue for a period, platform-wide or for one restaurant, grouped by product name. Product names are restaurant-written text: cleaned with `textoSeguro`.
- **S5 — Safety.** Still read-only SELECTs, parameterized, no ids chosen by the model, no free text beyond cleaned names.
- **S6 — Docs.**

## Tasks

- [ ] T1 — S1 — `services/Admin/AsistenteSistema/periodos.js`
- [ ] T2 — S2, S3, S4, S5 — repository queries + the three tools (replacing `ventas_hoy_plataforma`)
- [ ] T3 — S6 — docs, prompt hint

## Log

- L1 (2026-11-11, user, verbatim): "me gustaria es poder hacerlo mas personalizado el de superadmin, poder hacer preguntas como cuanto se ha vendido que local es el que mas me ha vendido, o cosas por el estilo si me entiendes"
- Risk: none new beyond the system assistant (read-only SELECTs, same hygiene); no independent verifier needed unless the diff touches write paths.
