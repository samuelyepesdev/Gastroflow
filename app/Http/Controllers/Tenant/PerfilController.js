const TenantService = require('../../../../services/Admin/TenantService');
const StatsService = require('../../../../services/Tenant/StatsService');
const ReporteMensualService = require('../../../../services/Tenant/ReporteMensualService');

class PerfilController {
    // GET /perfil
    static async index(req, res) {
        try {
            const tenantId = req.tenant.id;
            const stats = await StatsService.getDashboardStats(tenantId);
            res.render('perfil/index', { tenant: req.tenant, user: req.user, stats });
        } catch (error) {
            console.error('Error cargando perfil:', error);
            res.status(500).render('errors/internal', { error: { message: 'Error cargando perfil' } });
        }
    }

    // POST /perfil/actualizar
    static async update(req, res) {
        try {
            const tenantId = req.tenant.id;
            const { nombre, direccion, telefono, email, colores } = req.body;

            let newConfig = req.tenant.config || {};
            if (typeof newConfig === 'string') {
                try {
                    newConfig = JSON.parse(newConfig);
                } catch (e) {
                    newConfig = {};
                }
            }

            if (colores) {
                newConfig.colores = JSON.parse(colores);
            }

            const updateData = {
                nombre,
                direccion,
                telefono,
                email,
                config: newConfig
            };

            if (req.file) {
                updateData.logo_data = req.file.buffer;
                updateData.logo_tipo = req.file.mimetype.split('/')[1];
                if (newConfig.logo) {
                    delete newConfig.logo;
                }
            }

            await TenantService.updateTenant(tenantId, updateData);

            res.json({
                success: true,
                message:
                    'Perfil actualizado correctamente. Los cambios se mantendrán incluso después de nuevos deploys.'
            });
        } catch (error) {
            console.error('Error actualizando perfil:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    // POST /perfil/test-report
    static async testReport(req, res) {
        try {
            const tenant = req.tenant;
            const { mes, anio } = req.body;

            console.log(`Solicitud de reporte ${mes || 'actual'}/${anio || ''} para ${tenant.nombre}...`);

            // Enviamos el reporte especificado (o el actual como fallback de prueba)
            const result = await ReporteMensualService.generarYEnviar(tenant, {
                mes: mes,
                anio: anio,
                testMesActual: !mes && !anio
            });

            const msg = `Reporte de ${mes ? 'mes solicitado' : 'mes actual'} enviado con éxito vía Email.`;

            res.json({
                success: true,
                message: msg,
                // Forzamos conversión a Buffer de Node para asegurar un Base64 limpio
                pdfBase64: result.pdfBuffer ? Buffer.from(result.pdfBuffer).toString('base64') : null,
                fileName: `Reporte_${mes || 'Actual'}_${anio || ''}.pdf`
            });
        } catch (error) {
            console.error('Error enviando reporte de prueba:', error);
            res.status(500).json({ success: false, message: 'Error enviando reporte: ' + error.message });
        }
    }
}

module.exports = PerfilController;
