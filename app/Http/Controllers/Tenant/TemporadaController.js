const TemporadaService = require('../../../../services/Tenant/TemporadaService');
const TemaTemporadaService = require('../../../../services/Tenant/TemaTemporadaService');
const ProductRepository = require('../../../../repositories/Tenant/ProductRepository');
const { hoyColombia } = require('../../../../utils/dateHelpers');
const { responderError } = require('../../../../utils/errors');

class TemporadaController {
    // GET /temporada
    static async index(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res
                    .status(403)
                    .render('errors/generic', { error: { message: 'Contexto de tenant no disponible' } });
            }
            const hoy = hoyColombia();
            const [productos, vigencias, tema] = await Promise.all([
                ProductRepository.findAll(tenantId),
                TemporadaService.listarVigencias(tenantId),
                TemaTemporadaService.getConfig(tenantId)
            ]);
            res.render('temporada/index', {
                hoy,
                tema,
                temaSugerido: TemaTemporadaService.ventanaSugerida(hoy),
                diasParaNavidad: TemporadaService.diasParaNavidad(hoy),
                plantillas: TemporadaService.listarPlantillas(hoy),
                productos: (productos || []).map(p => ({ id: p.id, nombre: p.nombre, es_combo: !!p.es_combo })),
                vigencias,
                user: req.user,
                tenant: req.tenant
            });
        } catch (error) {
            console.error('Error al cargar temporada:', error);
            res.status(500).render('errors/generic', { error: { message: 'Error al cargar la temporada' } });
        }
    }

    // PUT /temporada/tema
    static async guardarTema(req, res) {
        try {
            res.json({ tema: await TemaTemporadaService.guardar(req.tenant.id, req.body) });
        } catch (error) {
            console.error('Error al guardar el tema de temporada:', error);
            responderError(res, error, 'No se pudo guardar el tema');
        }
    }

    // POST /temporada/promocion
    static async crearPromocion(req, res) {
        try {
            const r = await TemporadaService.crearPromocionDePlantilla(req.tenant.id, req.user?.id || null, req.body);
            res.status(201).json(r);
        } catch (error) {
            console.error('Error al crear promoción de plantilla:', error);
            responderError(res, error, 'No se pudo crear la promoción');
        }
    }

    // GET /temporada/vigencias
    static async vigencias(req, res) {
        try {
            res.json({ vigencias: await TemporadaService.listarVigencias(req.tenant.id) });
        } catch (error) {
            console.error('Error al listar vigencias:', error);
            responderError(res, error, 'No se pudieron cargar las vigencias');
        }
    }

    // PUT /temporada/vigencias
    static async fijarVigencia(req, res) {
        try {
            res.json(await TemporadaService.fijarVigencia(req.tenant.id, req.body));
        } catch (error) {
            console.error('Error al fijar vigencia:', error);
            responderError(res, error, 'No se pudo guardar la vigencia');
        }
    }

    // DELETE /temporada/vigencias/:productoId
    static async quitarVigencia(req, res) {
        try {
            res.json(await TemporadaService.quitarVigencia(req.tenant.id, req.params.productoId));
        } catch (error) {
            console.error('Error al quitar vigencia:', error);
            responderError(res, error, 'No se pudo quitar la vigencia');
        }
    }
}

module.exports = TemporadaController;
