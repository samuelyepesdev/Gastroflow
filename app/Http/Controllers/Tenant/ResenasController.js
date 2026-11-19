const QRCode = require('qrcode');
const ResenaService = require('../../../../services/Tenant/ResenaService');
const { obtenerBaseUrl } = require('../../../../utils/baseUrl');
const { responderError } = require('../../../../utils/errors');

const puede = (req, permiso) => !!req.user?.permisos?.includes(permiso);

/** Config lista para la vista: enlace absoluto y QR para imprimir. */
async function configParaVista(req, config) {
    const enlace = config.token_publico ? `${obtenerBaseUrl(req)}/resena/${config.token_publico}` : null;
    return {
        activo: !!config.activo,
        google_url: config.google_url || '',
        mensaje_gracias: config.mensaje_gracias || '',
        enlace,
        qr: enlace ? await QRCode.toDataURL(enlace, { margin: 2, width: 600 }) : null
    };
}

class ResenasController {
    // GET /resenas
    static async index(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res
                    .status(403)
                    .render('errors/generic', { error: { message: 'Contexto de tenant no disponible' } });
            }
            const config = await configParaVista(req, await ResenaService.getConfig(tenantId));
            res.render('resenas/index', {
                config,
                puedeGestionar: puede(req, 'resenas.gestionar'),
                puedeConfigurar: puede(req, 'resenas.configurar'),
                user: req.user,
                tenant: req.tenant
            });
        } catch (error) {
            console.error('Error al cargar reseñas:', error);
            res.status(500).render('errors/generic', { error: { message: 'Error al cargar las reseñas' } });
        }
    }

    // GET /resenas/data?estado=nueva&bajas=1
    static async listar(req, res) {
        try {
            const [resenas, resumen] = await Promise.all([
                ResenaService.listar(req.tenant.id, { estado: req.query.estado, soloBajas: req.query.bajas === '1' }),
                ResenaService.resumen(req.tenant.id)
            ]);
            res.json({ resenas, resumen });
        } catch (error) {
            console.error('Error al listar reseñas:', error);
            responderError(res, error, 'No se pudieron cargar las reseñas');
        }
    }

    // PUT /resenas/config
    static async guardarConfig(req, res) {
        try {
            const config = await ResenaService.guardarConfig(req.tenant.id, req.body);
            res.json({ ok: true, config: await configParaVista(req, config) });
        } catch (error) {
            console.error('Error al guardar la configuración de reseñas:', error.message);
            responderError(res, error, 'No se pudo guardar la configuración');
        }
    }

    // POST /resenas/config/enlace
    static async regenerarEnlace(req, res) {
        try {
            const config = await ResenaService.regenerarEnlace(req.tenant.id);
            res.json({ ok: true, config: await configParaVista(req, config) });
        } catch (error) {
            console.error('Error al regenerar el enlace de reseñas:', error.message);
            responderError(res, error, 'No se pudo cambiar el enlace');
        }
    }

    // PATCH /resenas/:id/estado   { atendida: true|false }
    static async estado(req, res) {
        try {
            await ResenaService.marcarAtendida(req.tenant.id, req.params.id, req.body?.atendida === true);
            res.json({ ok: true });
        } catch (error) {
            console.error('Error al actualizar la reseña:', error.message);
            responderError(res, error, 'No se pudo actualizar la reseña');
        }
    }
}

module.exports = ResenasController;
