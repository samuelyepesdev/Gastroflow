const db = require('./database');
const cron = require('node-cron');
const ReporteMensualService = require('../services/Tenant/ReporteMensualService');
const WhatsAppService = require('../services/Tenant/WhatsAppService');
const FacturacionElectronicaWorkerService = require('../services/Tenant/FacturacionElectronicaWorkerService');

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

        console.log('--- Cron jobs iniciados exitosamente ---');

        // Inicializar WhatsApp para tenants que ya estaban conectados
        try {
            // Limpiar estados inconsistentes (si el servidor se apagó esperando un QR, ese QR ya no sirve)
            await db.query(
                'UPDATE whatsapp_configs SET estado = "desconectado", last_qr = NULL WHERE estado = "esperando_qr"'
            );

            const [configs] = await db.query('SELECT tenant_id FROM whatsapp_configs WHERE estado = "conectado"');
            for (const row of configs) {
                WhatsAppService.initializeClient(row.tenant_id).catch(e =>
                    console.error(`Error reconectando WhatsApp tenant ${row.tenant_id}:`, e)
                );
            }
        } catch (waErr) {
            console.error('Error inicializando WhatsApp Service:', waErr.message);
        }
    } catch (cronErr) {
        console.error('Error iniciando cron jobs:', cronErr.message);
    }
};

module.exports = { runBackgroundJobs };
