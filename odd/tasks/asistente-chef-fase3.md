# Asistente Chef — Phase 3: interface (text chat panel + voice)

Objective: a floating button on every authenticated page that opens a chat panel talking to the existing `/api/asistente` backend. Branch: `feature/asistente-ui` (from `develop`). Delivery: one PR per task group, base `develop`. Test runner: jest (node env) for server pieces; browser pieces verified in the browser pane.

## Specs

- **S1 — Visibility.** The button appears only when the user passes the same three gates as the API: add-on `asistente` in `req.tenant.addonSlugs`, permission `asistente.usar`, and the server key configured. Computed server-side in `navbarLocals` as `nav.can.asistente`; users without access never get the markup or the script.
- **S2 — Assistant name.** `GET /api/asistente/estado` (behind `requireAsistente`) returns `{ nombre }` from `asistente_config` (default "Chef"). The panel title and placeholder use it.
- **S3 — Chat.** The panel sends `POST /api/asistente/comando` with `{ texto, historial }` (last 6 text turns, user/assistant only). Shows user and assistant bubbles, a "pensando" state, disables sending while waiting. Enter sends; text max 500 chars.
- **S4 — Confirmation.** A `tipo: 'confirmacion'` reply renders the summary with **Confirmar** and **Cancelar** buttons calling `POST /api/asistente/confirmar` with `aceptar: true|false`, an `Idempotency-Key` header, and buttons disabled after one click. After resolving, the buttons are replaced by the result text. Expired confirmations (`confirmacion_invalida`) show the server message.
- **S5 — Errors.** Every error code shows the server `texto`; 429 shows a "wait a moment" message; network failure shows a generic retry message. Nothing is lost from the input on failure.
- **S6 — XSS.** All server text (it can contain product names and customer notes) is inserted with `textContent` or `GF.escapeHtml`, never as raw HTML.
- **S7 — Voice input (progressive).** A microphone button appears only if the browser supports `SpeechRecognition`/`webkitSpeechRecognition`; language `es-CO`; the recognized text fills the input and is sent on a final result. No audio leaves the browser except through the browser's own recognition.
- **S8 — Voice output (progressive).** A speaker toggle (off by default, remembered in `localStorage` inside try/catch) reads assistant replies with `speechSynthesis` in `es-CO` when supported.
- **S9 — Mobile and brand.** Works at phone width (panel full-width bottom sheet), uses brand tokens from `brand.css` (no loose hex), accessible labels, `Esc` closes, focus returns to the button.
- **S10 — Docs.** `docs/modulos/20_asistente_chef.md` documents the panel, `/estado` and voice limits.

## Tasks

- [x] T1 — S1, S2 — inline — `GET /api/asistente/estado`, `nav.can.asistente` in `middleware/navbarLocals.js` — evidence: RED (8 failing) then 9/9 green, eslint clean — commit: `feat(asistente): estado del asistente y visibilidad del boton`
- [x] T2 — S3, S4, S5, S6, S9 — inline — partial `views/partials/_asistente.ejs` (included from `navbar.ejs` only when `nav.can.asistente`), `public/css/core/asistente.css`, `public/js/core/asistente.js` (+ small helper files) — evidence: 2 view tests green; checked in the browser pane against a mock server (open, ask, confirm, XSS text stays text, 429 keeps the input, mobile width, Esc returns focus); NOT yet checked against the real app/DB — commit: `feat(asistente): panel de chat del asistente`
- [x] T3 — S7, S8 — inline — `public/js/core/asistente-voz.js` — evidence: view test green; browser pane with stubbed SpeechRecognition/speechSynthesis: dictation sends the recognized text, replies are spoken in es-CO, preference persists in localStorage, muting cancels speech; real microphone NOT tested (blocked in the pane) — commit: `feat(asistente): voz de entrada y salida del asistente`
- [x] T4 — S10 — inline — `docs/modulos/20_asistente_chef.md` updated (panel, `/estado`, voice limits) — commit: `docs(asistente): documentar el panel y la voz`

## Log

- L1 (2026-11-11, user, verbatim): "Sí, hagamos la Fase 3 de la interfaz y completemos eso yo pense que ya estaba eso"
- Assumption: voice (the original "Siri" idea) is included as progressive enhancement in T3, separable from the text panel.
- Constraint carried over: production source files stay small (one responsibility per file, about 150 lines or less).
