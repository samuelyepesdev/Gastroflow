const cron = require('node-cron');
const ReporteMensualService = require('../services/Tenant/ReporteMensualService');
const FacturacionElectronicaWorkerService = require('../services/Tenant/FacturacionElectronicaWorkerService');
const JobWorkerService = require('../services/Shared/JobWorkerService');
const DesktopSyncService = require('../services/Shared/DesktopSyncService');
const SuscripcionService = require('../services/Admin/SuscripcionService');

const runBackgroundJobs = async () => {
    try {
        // Se evalúa todos los días a las 23:50 para ver si es el último día del mes
        cron.schedule('50 23 * * *', async () => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            if (tomorrow.getDate() === 1) {
                console.log('--- CRON: Último día del mes detectado. Iniciando envío de reportes mensuales ---');
                await ReporteMensualService.procesarCierreMensual({ finDeMes: true });
            }
        });

        // Worker de emisión de facturación electrónica (Factus): procesa la cola cada minuto.
        cron.schedule('* * * * *', () => {
            FacturacionElectronicaWorkerService.procesarPendientes();
        });

        // Worker de job_queue genérico (PDF pesados, email): procesa cada 15s para que
        // el usuario no espere demasiado por algo que antes era síncrono en el request.
        cron.schedule('*/15 * * * * *', () => {
            JobWorkerService.procesarPendientes();
        });

        // Ciclo de sync del prototipo de escritorio: no-op en producción normal
        // (DesktopSyncService.runCycle sale de inmediato si SYNC_API_URL no está
        // seteado). Solo hace algo cuando este proceso es el server.js local de
        // Electron.
        cron.schedule('*/15 * * * * *', () => {
            DesktopSyncService.runCycle();
        });

        // Cobro recurrente de suscripciones (Wompi): 8:00am hora Bogotá (13:00 UTC).
        // Nunca toca tenants sin tarjeta registrada (wompi_payment_source_id NULL) --
        // ver SuscripcionService.procesarCobrosDiarios para la regla de seguridad.
        cron.schedule('0 13 * * *', async () => {
            try {
                await SuscripcionService.reconciliarPendientes();
                await SuscripcionService.procesarCobrosDiarios();
            } catch (err) {
                console.error('Error en cron de cobro de suscripciones:', err.message);
            }
        });

        console.log('--- Cron jobs iniciados exitosamente ---');
    } catch (cronErr) {
        console.error('Error iniciando cron jobs:', cronErr.message);
    }
};

module.exports = { runBackgroundJobs };
