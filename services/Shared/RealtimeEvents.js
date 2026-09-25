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
 *  - 'mesasChanged'  { tenantId } -- cambió el estado/lista de mesas (abrir, mover,
 *    crear/editar/eliminar mesa). Solo lo consume la pantalla de Mesas para
 *    refrescar la grilla sin polling agresivo; no dispara recargas en otras pantallas.
 *  - 'ventaRegistrada' { tenantId } -- se creó una factura. Invalida la caché de
 *    estadísticas del tenant (StatsService) y refresca el dashboard del tenant y
 *    las estadísticas en vivo del superadmin.
 *
 * Consumidores: app/Http/Controllers/Tenant/NotificationController.js (SSE).
 */
const EventEmitter = require('events');

const events = new EventEmitter();
// Cada pantalla conectada (cocina, mesas, POS, dashboard) de cualquier tenant
// engancha un listener aquí; con varios tenants y pantallas se pasa fácil el
// límite por defecto de Node (10) sin que sea una fuga real.
events.setMaxListeners(100);

/**
 * Avisa a las pantallas de Mesas del tenant que deben refrescar la grilla.
 * Nunca lanza: una falla notificando no debe tumbar la acción que ya se guardó.
 */
events.emitMesasChanged = tenantId => {
    try {
        events.emit('mesasChanged', { tenantId });
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Error al emitir mesasChanged:', err);
    }
};

/** Igual que emitMesasChanged, para facturas nuevas. Nunca lanza. */
events.emitVentaRegistrada = tenantId => {
    try {
        events.emit('ventaRegistrada', { tenantId });
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Error al emitir ventaRegistrada:', err);
    }
};

module.exports = events;
