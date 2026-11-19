/**
 * temaPanel.js
 * Expone res.locals.temaPanel (tema de temporada o null) a las páginas del panel de un restaurante, para que la
 * barra de navegación compartida pinte las luces y la nieve. Va después de attachTenantContext.
 *
 * Solo corre en páginas (GET, no /api) y se salta las pantallas operativas, donde la nieve estorbaría o
 * gastaría recursos en equipos modestos: el POS y la cocina (KDS). Nunca rompe la página.
 */
const TemaTemporadaService = require('../services/Tenant/TemaTemporadaService');

const RUTAS_OPERATIVAS = ['/pos', '/cocina'];

const esOperativa = ruta => RUTAS_OPERATIVAS.some(p => ruta === p || ruta.startsWith(`${p}/`));

module.exports = async function temaPanel(req, res, next) {
    try {
        const ruta = String(req.originalUrl || '').split('?')[0];
        if (req.method === 'GET' && req.tenant && req.tenant.id && !ruta.startsWith('/api/') && !esOperativa(ruta)) {
            res.locals.temaPanel = await TemaTemporadaService.getActivoPanel(req.tenant.id);
        }
    } catch (error) {
        console.error('Error cargando el tema del panel:', error.message);
    }
    next();
};
module.exports.esOperativa = esOperativa;
