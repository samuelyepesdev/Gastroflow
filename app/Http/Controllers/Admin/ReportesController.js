const TenantService = require('../../../../services/Admin/TenantService');
const JobQueueRepository = require('../../../../repositories/Shared/JobQueueRepository');

class ReportesController {
    // GET /admin/reportes
    static async index(req, res) {
        try {
            const allTenants = await TenantService.getAllTenants();
            const activeTenants = (allTenants || []).filter(t => t.activo);

            res.render('admin/reportes', {
                user: req.user,
                tenants: activeTenants,
                currentAdminPage: 'reportes'
            });
        } catch (error) {
            console.error('Error al cargar la sección de reportes:', error);
            res.status(500).render('errors/internal', { error });
        }
    }

    // GET /admin/reportes/exportar-pdf - encola la generación (puppeteer es pesado,
    // no debe bloquear el request). El frontend hace polling a /admin/jobs/:id y
    // descarga desde /admin/jobs/:id/download cuando el worker termina.
    static async exportPdf(req, res) {
        try {
            const { mes, anio } = req.query;

            if (!mes || !anio) {
                return res.status(400).json({ error: 'Mes y año son requeridos.' });
            }

            const mesInt = parseInt(mes, 10);
            const anioInt = parseInt(anio, 10);

            if (isNaN(mesInt) || mesInt < 1 || mesInt > 12) {
                return res.status(400).json({ error: 'Mes inválido.' });
            }

            if (isNaN(anioInt) || anioInt < 2000 || anioInt > 2100) {
                return res.status(400).json({ error: 'Año inválido.' });
            }

            const jobId = await JobQueueRepository.encolar('pdf_reporte_consolidado', { mes: mesInt, anio: anioInt });
            res.json({ jobId });
        } catch (error) {
            console.error('[PDF_CONSOLIDADO_EXPORT_ERROR]:', error);
            res.status(500).json({ error: 'Error al encolar la generación del reporte consolidado.' });
        }
    }
}

module.exports = ReportesController;
