/**
 * RealtimeEvents - Bus de eventos en proceso para las notificaciones en tiempo
 * real (SSE) del panel: cocina, mesas, POS y dashboard.
 *
 * Antes este EventEmitter vivía dentro de WhatsAppService (`WhatsAppService.events`)
 * por razones históricas. Al quitar la integración de WhatsApp se movió acá, que
 * es donde corresponde: no tiene nada que ver con WhatsApp y no arrastra ninguna
 * dependencia pesada.
 *
 * Eventos que circulan:
 *  - 'orderCreated'  { tenantId, pedidoId, mesaId, origen?, action? }
 *  - 'mesaSolicitud' { tenantId, mesaId, mesaNumero, pedidoId, tipo }
 *
 * Consumidores: app/Http/Controllers/Tenant/NotificationController.js (SSE).
 */
const EventEmitter = require('events');

const events = new EventEmitter();
// Cada pantalla conectada (cocina, mesas, POS, dashboard) de cualquier tenant
// engancha un listener aquí; con varios tenants y pantallas se pasa fácil el
// límite por defecto de Node (10) sin que sea una fuga real.
events.setMaxListeners(100);

module.exports = events;
