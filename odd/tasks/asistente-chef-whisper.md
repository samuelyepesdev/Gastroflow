# Asistente Chef — server-side dictation (Groq Whisper)

Objective: dictation that works in every browser (Brave, Firefox, Safari, mobile) by recording audio in the browser and transcribing it on the server with Groq Whisper, replacing the browser SpeechRecognition as the primary path. Branch: `feature/asistente-whisper` (from `develop`), closed into `develop` by gitflow like the previous features. Test runner: jest.

## Specs

- **S1 — Transcriber.** `llm/GroqTranscriber` posts multipart audio to `https://api.groq.com/openai/v1/audio/transcriptions` with model `whisper-large-v3-turbo` (env `GROQ_STT_MODEL`), `language=es`, `response_format=json`, `temperature=0`. Same safety as the chat provider: key only on the server, timeout, errors become `LlmError` with safe messages (never the provider body).
- **S2 — Endpoint.** `POST /api/asistente/transcribir` with the raw audio as body. Same three-layer access as the rest of the assistant (add-on, permission, key), a per-user limit (default 20/min, `ASISTENTE_LIMITE_TRANSCRIBIR_MIN`), a size cap (1 MB) and an allow-list of audio content types (webm, ogg, mp4, mpeg, wav, flac, m4a). Responds `{ tipo: 'transcripcion', texto }`. Audio is processed in memory, never written to disk or logged.
- **S3 — Audit.** `asistente.transcribir` records only the byte count and the outcome (no audio, no transcript; the transcript is audited later as the command text).
- **S4 — Client.** The microphone button records with `MediaRecorder` (max 20 s, second click or silence-free stop), sends the audio to the endpoint and then sends the transcript as the command. If the browser cannot record, it falls back to the browser's own SpeechRecognition. Clear messages for: no permission, no microphone, nothing heard, server errors.
- **S5 — Docs and env.** `.env.example`, `docs/modulos/20_asistente_chef.md`.

## Tasks

- [ ] T1 — S1 — `services/Tenant/Asistente/llm/GroqTranscriber.js`, factory in `llm/index.js`
- [ ] T2 — S2, S3 — `TranscripcionService`, controller action, route, limiter
- [ ] T3 — S4 — `public/js/core/asistente-dictado.js` (+ api method), partial
- [ ] T4 — S5 — docs, `.env.example`

## Log

- L1 (2026-11-11, user, verbatim): "Sí, implementa Whisper en el servidor y eso es de paga o que tenemos que hacer"
- Context: the user's video shows Brave, where browser SpeechRecognition always fails with a `network` error (Brave removes the Google speech service).
- Risk: item 2 (an authenticated endpoint that accepts uploads and spends a paid API quota) — access control, size/type limits and per-user rate limit are part of the specs; an independent check is warranted.
