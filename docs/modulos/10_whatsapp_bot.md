# 🤖 Módulo 10: Integración de WhatsApp Bot — ❌ ELIMINADO (2026-09)

> **Este módulo fue removido del sistema.** Se documenta aquí solo como referencia histórica.

### ¿Por qué se eliminó?
La integración usaba `whatsapp-web.js`, que levanta un **Chromium headless por cada tenant conectado** (~150–350 MB de RAM cada uno). En un despliegue tipo Railway la memoria era ~96 % del costo del servidor, y el bot ya prácticamente no se usaba. Se decidió quitarlo por completo para reducir el gasto de infraestructura.

### Qué se borró
* `services/Tenant/WhatsAppService.js`
* `app/Http/Controllers/Tenant/WhatsAppController.js`
* `routes/tenant/whatsapp.js`, mount `/whatsapp` en `routes/web.js`
* `public/js/modulos/whatsapp.js`, `views/configuracion/whatsapp.ejs`
* Dependencia `whatsapp-web.js` del `package.json`
* Entradas de menú y `nav.can.whatsapp` en `middleware/navbarLocals.js`

### Qué lo reemplazó / a dónde se movió
* **Bus de eventos en tiempo real (SSE):** el `EventEmitter` global vivía dentro de `WhatsAppService.events` por razones históricas (nunca dependió de WhatsApp). Se movió a **`services/Shared/RealtimeEvents.js`**. Todos los emisores (`PedidoQRService`, `CocinaService`, `POSService`, `FacturarPedidoService`, servicios de `Mesas/`) y el consumidor (`NotificationController`, SSE en `GET /api/notifications/subscribe`) apuntan ahí. **El funcionamiento de las notificaciones no cambió.**
* **Reporte mensual:** `ReporteMensualService` ya no intenta enviar el PDF por WhatsApp; ahora se envía **solo por correo** (y queda disponible para descarga en el panel de perfil).

### Restos inofensivos (no se limpiaron)
* Tablas `whatsapp_configs` / `whatsapp_conversations` y migraciones `037`–`044` (históricas).
* Permisos `whatsapp.*` en la BD (muertos).
* Etiquetas "WhatsApp / Domicilios" en la grilla de mesas virtuales (esa UI sirve también para domicilios).
