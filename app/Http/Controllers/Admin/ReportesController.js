const TenantService = require('../../../../services/Admin/TenantService');
const ReporteConsolidadoService = require('../../../../services/Admin/ReporteConsolidadoService');

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

    // GET /admin/reportes/exportar-pdf
    static async exportPdf(req, res) {
        try {
            const { mes, anio } = req.query;

            if (!mes || !anio) {
                return res.status(400).send('Mes y año son requeridos.');
            }

            const mesInt = parseInt(mes, 10);
            const anioInt = parseInt(anio, 10);

            if (isNaN(mesInt) || mesInt < 1 || mesInt > 12) {
                return res.status(400).send('Mes inválido.');
            }

            if (isNaN(anioInt) || anioInt < 2000 || anioInt > 2100) {
                return res.status(400).send('Año inválido.');
            }

            const pdfBuffer = await ReporteConsolidadoService.generarReporteConsolidado({
                mes: mesInt,
                anio: anioInt
            });

            // Headers seguros para Express
            res.type('application/pdf');
            res.attachment(`Reporte_Consolidado_${mesInt}_${anioInt}.pdf`);
            return res.end(pdfBuffer, 'binary');
        } catch (error) {
            console.error('[PDF_CONSOLIDADO_EXPORT_ERROR]:', error);
            res.status(500).send(`
                <div style="font-family:sans-serif; text-align:center; padding:50px;">
                    <h1 style="color:#ef4444;">Error al generar el reporte consolidado</h1>
                    <p>${error.message}</p>
                    <button onclick="window.close()">Cerrar pestaña</button>
                </div>
            `);
        }
    }
}

module.exports = ReportesController;
