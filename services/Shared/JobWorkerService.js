/**
 * JobWorkerService - Procesa la cola `job_queue` (worker genérico, mismo patrón que
 * FacturacionElectronicaWorkerService). Nunca bloquea el request que encoló el job:
 * se ejecuta por intervalo, disparado desde config/bootstrap.js.
 */

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const JobQueueRepository = require('../../repositories/Shared/JobQueueRepository');
const MailerService = require('./MailerService');
const logger = require('../../utils/logger');

const JOB_RESULTS_DIR = path.join(__dirname, '../../storage/job_results');

async function handlePdfReporteConsolidado(job) {
    const ReporteConsolidadoService = require('../Admin/ReporteConsolidadoService');
    const pdfBuffer = await ReporteConsolidadoService.generarReporteConsolidado(job.payload);
    const filename = `reporte-consolidado-${job.id}-${randomUUID()}.pdf`;
    fs.writeFileSync(path.join(JOB_RESULTS_DIR, filename), pdfBuffer);
    return filename;
}

async function handlePdfPlanes(job) {
    const PlanesPdfService = require('../Admin/PlanesPdfService');
    const pdfBuffer = await PlanesPdfService.generarPortafolioPdf();
    const filename = `planes-portafolio-${job.id}-${randomUUID()}.pdf`;
    fs.writeFileSync(path.join(JOB_RESULTS_DIR, filename), pdfBuffer);
    return filename;
}

async function handleEmailSoporte(job) {
    await MailerService.sendMail(job.payload);
    return null;
}

const HANDLERS = {
    pdf_reporte_consolidado: handlePdfReporteConsolidado,
    pdf_planes: handlePdfPlanes,
    email_soporte: handleEmailSoporte
};

let procesando = false;

class JobWorkerService {
    /**
     * Procesa un lote de jobs pendientes. Ignora la invocación si ya hay un ciclo en
     * curso (evita solapamiento si el lote anterior tarda más que el intervalo del cron).
     */
    static async procesarPendientes() {
        if (procesando) {
            return;
        }
        procesando = true;
        try {
            if (!fs.existsSync(JOB_RESULTS_DIR)) {
                fs.mkdirSync(JOB_RESULTS_DIR, { recursive: true });
            }
            const pendientes = await JobQueueRepository.findPendientes(10);
            for (const job of pendientes) {
                await JobWorkerService._procesarJob(job);
            }
        } catch (error) {
            logger.error('Error en worker de job_queue', { error: error.message });
        } finally {
            procesando = false;
        }
    }

    static async _procesarJob(job) {
        const handler = HANDLERS[job.tipo];
        if (!handler) {
            await JobQueueRepository.registrarFallo(job.id, `Tipo de job desconocido: ${job.tipo}`, job.intentos);
            return;
        }
        await JobQueueRepository.marcarProcesando(job.id);
        try {
            const resultadoPath = await handler(job);
            await JobQueueRepository.marcarCompletado(job.id, resultadoPath);
        } catch (error) {
            logger.error(`Error procesando job ${job.id} (${job.tipo})`, { error: error.message });
            await JobQueueRepository.registrarFallo(job.id, error.message, job.intentos);
        }
    }
}

module.exports = JobWorkerService;
