const AnaliticaService = require('../../../../services/Tenant/AnaliticaService');
const logger = require('../../../../utils/logger');

class AnaliticaController {
    // GET /analitica
    static async index(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res
                    .status(403)
                    .render('errors/internal', { error: { message: 'Contexto de tenant no disponible' } });
            }
            const data = await AnaliticaService.getAnaliticaCompleta(tenantId);
            const allowedByPlan = res.locals.allowedByPlan || {};
            const tienePermisoPrediccion = req.user.permisos && req.user.permisos.includes('prediccion.ver');
            const canShowPrediccion = allowedByPlan.prediccion_ml === true || tienePermisoPrediccion;
            res.render('analitica/index', {
                user: req.user,
                tenant: req.tenant,
                allowedByPlan,
                canShowPrediccion: !!canShowPrediccion,
                resumen: data.resumen,
                prediccion: data.prediccion
            });
        } catch (error) {
            logger.error('Error al cargar analítica', { error: error.message, stack: error.stack });
            res.status(500).render('errors/internal', {
                error: { message: 'Error al cargar analítica', stack: error.stack }
            });
        }
    }

    // GET /analitica/datos
    static async getDatos(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const data = await AnaliticaService.getAnaliticaCompleta(tenantId);
            res.json(data);
        } catch (error) {
            logger.error('Error al obtener datos de analítica', { error: error.message });
            res.status(500).json({ error: 'Error al obtener datos' });
        }
    }
}

module.exports = AnaliticaController;
