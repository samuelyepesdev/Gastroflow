const ReservaService = require('../../../../services/Tenant/ReservaService');
const { hoyColombia } = require('../../../../utils/dateHelpers');
const { responderError } = require('../../../../utils/errors');

const puede = (req, permiso) => !!req.user?.permisos?.includes(permiso);

class ReservasController {
    // GET /reservas
    static async index(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res
                    .status(403)
                    .render('errors/generic', { error: { message: 'Contexto de tenant no disponible' } });
            }
            const config = await ReservaService.getConfig(tenantId);
            res.render('reservas/index', {
                hoy: hoyColombia(),
                config,
                puedeGestionar: puede(req, 'reservas.gestionar'),
                puedeConfigurar: puede(req, 'reservas.configurar'),
                user: req.user,
                tenant: req.tenant
            });
        } catch (error) {
            console.error('Error al cargar reservas:', error);
            res.status(500).render('errors/generic', { error: { message: 'Error al cargar las reservas' } });
        }
    }

    // GET /reservas/data?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
    static async listar(req, res) {
        try {
            const reservas = await ReservaService.listar(req.tenant.id, req.query.desde, req.query.hasta);
            res.json({ reservas });
        } catch (error) {
            console.error('Error al listar reservas:', error);
            responderError(res, error, 'No se pudieron cargar las reservas');
        }
    }

    // GET /reservas/mesas-disponibles?fecha=&hora=&personas= -> mesas libres a esa hora (con capacidad suficiente)
    static async mesasDisponibles(req, res) {
        try {
            const config = await ReservaService.getConfigCompleta(req.tenant.id);
            const mesas = await ReservaService.mesasDisponibles(
                req.tenant.id,
                config,
                req.query.fecha,
                req.query.hora,
                req.query.personas
            );
            res.json({ mesas });
        } catch (error) {
            console.error('Error al consultar mesas disponibles:', error);
            responderError(res, error, 'No se pudieron consultar las mesas disponibles');
        }
    }

    // PUT /reservas/mesas/capacidades { mesas: [{ id, capacidad }] }
    static async capacidades(req, res) {
        try {
            res.json({ mesas: await ReservaService.guardarCapacidades(req.tenant.id, req.body) });
        } catch (error) {
            console.error('Error al guardar capacidades de mesas:', error);
            responderError(res, error, 'No se pudieron guardar las capacidades');
        }
    }

    // GET /reservas/mesas -> mesas físicas para asignar
    static async mesas(req, res) {
        try {
            res.json({ mesas: await ReservaService.listarMesas(req.tenant.id) });
        } catch (error) {
            console.error('Error al listar mesas para reservas:', error);
            responderError(res, error, 'No se pudieron cargar las mesas');
        }
    }

    // GET /reservas/disponibilidad?fecha=YYYY-MM-DD&personas=2
    static async disponibilidad(req, res) {
        try {
            const config = await ReservaService.getConfigCompleta(req.tenant.id);
            const franjas = await ReservaService.disponibilidad(
                req.tenant.id,
                config,
                req.query.fecha,
                req.query.personas
            );
            res.json({ franjas });
        } catch (error) {
            console.error('Error al consultar disponibilidad:', error);
            responderError(res, error, 'No se pudo consultar la disponibilidad');
        }
    }

    // POST /reservas
    static async store(req, res) {
        try {
            const resultado = await ReservaService.crearInterna(req.tenant.id, req.body);
            res.status(201).json(resultado);
        } catch (error) {
            console.error('Error al crear reserva:', error);
            responderError(res, error, 'No se pudo crear la reserva');
        }
    }

    // PATCH /reservas/:id/estado
    static async estado(req, res) {
        try {
            res.json(
                await ReservaService.cambiarEstado(Number.parseInt(req.params.id, 10), req.tenant.id, req.body?.estado)
            );
        } catch (error) {
            console.error('Error al cambiar estado de reserva:', error);
            responderError(res, error, 'No se pudo cambiar el estado');
        }
    }

    // PATCH /reservas/:id/mesa
    static async mesa(req, res) {
        try {
            res.json(
                await ReservaService.asignarMesa(
                    Number.parseInt(req.params.id, 10),
                    req.tenant.id,
                    req.body?.mesa_id,
                    req.body?.forzar === true || req.body?.forzar === '1'
                )
            );
        } catch (error) {
            console.error('Error al asignar mesa a reserva:', error);
            responderError(res, error, 'No se pudo asignar la mesa');
        }
    }

    // PUT /reservas/config
    static async guardarConfig(req, res) {
        try {
            res.json({ config: await ReservaService.guardarConfig(req.tenant.id, req.body) });
        } catch (error) {
            console.error('Error al guardar configuración de reservas:', error);
            responderError(res, error, 'No se pudo guardar la configuración');
        }
    }

    // POST /reservas/config/enlace
    static async regenerarEnlace(req, res) {
        try {
            res.json({ config: await ReservaService.regenerarEnlace(req.tenant.id) });
        } catch (error) {
            console.error('Error al regenerar enlace de reservas:', error);
            responderError(res, error, 'No se pudo regenerar el enlace');
        }
    }
}

module.exports = ReservasController;
