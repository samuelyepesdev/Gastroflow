/**
 * FacturacionElectronicaWorkerService - Procesa la cola `facturas_electronicas`
 * (worker de emisión asíncrona, Fase 3). Nunca bloquea el cierre de la venta:
 * se ejecuta por intervalo, disparado desde config/bootstrap.js.
 */

const FacturaElectronicaRepository = require('../../repositories/Tenant/FacturaElectronicaRepository');
const FacturacionElectronicaService = require('./FacturacionElectronicaService');
const logger = require('../../utils/logger');

let procesando = false;

class FacturacionElectronicaWorkerService {
    /**
     * Procesa un lote de facturas pendientes. Ignora la invocación si ya hay
     * un ciclo en curso (evita solapamiento si el lote anterior tarda más que
     * el intervalo del cron).
     */
    static async procesarPendientes() {
        if (procesando) {
            return;
        }
        procesando = true;
        try {
            const pendientes = await FacturaElectronicaRepository.findPendientes(20);
            for (const row of pendientes) {
                await FacturacionElectronicaService.emitir(row);
            }
        } catch (error) {
            logger.error('Error en worker de facturación electrónica', { error: error.message });
        } finally {
            procesando = false;
        }
    }
}

module.exports = FacturacionElectronicaWorkerService;
