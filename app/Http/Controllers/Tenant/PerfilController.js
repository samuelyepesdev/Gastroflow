const TenantService = require('../../../../services/Admin/TenantService');
const StatsService = require('../../../../services/Tenant/StatsService');
const ReporteMensualService = require('../../../../services/Tenant/ReporteMensualService');
const CrecimientoStatsService = require('../../../../services/Tenant/CrecimientoStatsService');

const PERIODOS_VALIDOS = [7, 30, 90, 180, 365];

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
                const R2StorageService = require('../../../../services/Tenant/R2StorageService');
                updateData.logo_url = await R2StorageService.uploadFile(
                    req.file.buffer,
                    req.file.originalname,
                    req.file.mimetype,
                    'logos'
                );
                // Limpiamos el BLOB viejo: de ahora en adelante logo_url es la fuente de
                // verdad (ver repositories/Admin/TenantRepository._mapRow).
                updateData.logo_data = null;
                updateData.logo_tipo = null;
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

    // GET /perfil/api/crecimiento
    static async crecimiento(req, res) {
        try {
            const tenantId = req.tenant.id;
            const periodoDias = PERIODOS_VALIDOS.includes(parseInt(req.query.periodo, 10))
                ? parseInt(req.query.periodo, 10)
                : 30;

            const stats = await CrecimientoStatsService.getCrecimientoStats(tenantId, { periodoDias });

            res.json(stats);
        } catch (error) {
            console.error('Error al cargar el panel de crecimiento del tenant:', error);
            res.status(500).json({ success: false, message: 'Error al cargar el panel de crecimiento' });
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
