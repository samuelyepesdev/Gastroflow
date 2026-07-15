/**
 * JobsController - Estado y descarga de resultados de job_queue (PDFs generados async).
 * Solo superadmin (mismo guard que reportes/planes): estos jobs contienen reportes
 * financieros consolidados de todos los tenants.
 */

const fs = require('fs');
const path = require('path');
const JobQueueRepository = require('../../../../repositories/Shared/JobQueueRepository');
const { JOB_RESULTS_DIR } = require('../../../../config/storage-paths');

const DOWNLOAD_NAMES = {
    pdf_reporte_consolidado: 'Reporte_Consolidado.pdf',
    pdf_planes: 'Portafolio_GastroFlow.pdf'
};

class JobsController {
    // GET /admin/jobs/:id - estado del job (para polling desde el frontend)
    static async show(req, res) {
        try {
            const job = await JobQueueRepository.findById(parseInt(req.params.id, 10));
            if (!job) {
                return res.status(404).json({ error: 'Job no encontrado' });
            }
            res.json({
                id: job.id,
                tipo: job.tipo,
                estado: job.estado,
                error: job.estado === 'error' ? job.error : null
            });
        } catch (_error) {
            res.status(500).json({ error: 'Error al consultar el job' });
        }
    }

    // GET /admin/jobs/:id/download - descarga el resultado (solo si está completado)
    static async download(req, res) {
        try {
            const job = await JobQueueRepository.findById(parseInt(req.params.id, 10));
            if (!job || job.estado !== 'completado' || !job.resultado_path) {
                return res.status(404).send('El resultado todavía no está listo.');
            }
            const filePath = path.join(JOB_RESULTS_DIR, path.basename(job.resultado_path));
            if (!fs.existsSync(filePath)) {
                return res.status(404).send('El archivo generado ya no está disponible.');
            }
            const downloadName = DOWNLOAD_NAMES[job.tipo] || 'reporte.pdf';
            res.type('application/pdf');
            res.attachment(downloadName);
            fs.createReadStream(filePath).pipe(res);
        } catch (_error) {
            res.status(500).send('Error al descargar el resultado.');
        }
    }
}

module.exports = JobsController;
