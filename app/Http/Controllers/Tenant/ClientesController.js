const ClienteService = require('../../../../services/Tenant/ClienteService');
const { responderError } = require('../../../../utils/errors');
const ParametroService = require('../../../../services/Shared/ParametroService');

class ClientesController {
    // GET /clientes
    static async index(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res
                    .status(403)
                    .render('errors/internal', { error: { message: 'Contexto de tenant no disponible' } });
            }

            const [clientes, tiposDocumento] = await Promise.all([
                ClienteService.getAll(tenantId),
                ParametroService.getByTemaName('TIPO_DOCUMENTO', tenantId)
            ]);

            res.render('clientes/index', {
                clientes: clientes || [],
                tiposDocumento: tiposDocumento || [],
                user: req.user,
                tenant: req.tenant
            });
        } catch (error) {
            console.error('Error al obtener clientes:', error);
            res.status(500).render('errors/internal', {
                error: {
                    message: 'Error al obtener clientes',
                    stack: error.stack
                }
            });
        }
    }

    // GET /clientes/buscar
    static async search(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const query = req.query.q || '';
            const clientes = await ClienteService.search(query, tenantId);
            res.json(clientes);
        } catch (error) {
            console.error('Error al buscar clientes:', error);
            res.status(500).json({ error: 'Error al buscar clientes' });
        }
    }

    // GET /clientes/:id
    static async show(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const cliente = await ClienteService.getById(parseInt(req.params.id), tenantId);
            res.json(cliente);
        } catch (error) {
            console.error('Error al obtener cliente:', error);
            if (error.message === 'Cliente no encontrado') {
                return res.status(404).json({ error: error.message });
            }
            res.status(500).json({ error: 'Error al obtener cliente' });
        }
    }

    // POST /clientes
    static async store(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const result = await ClienteService.create(tenantId, req.body);
            res.status(201).json(result);
        } catch (error) {
            console.error('Error al crear cliente:', error);
            responderError(res, error, 'Error al crear cliente');
        }
    }

    // PUT /clientes/:id
    static async update(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const result = await ClienteService.update(parseInt(req.params.id), tenantId, req.body);
            res.json(result);
        } catch (error) {
            console.error('Error al actualizar cliente:', error);
            responderError(res, error, 'Error al actualizar cliente');
        }
    }

    // DELETE /clientes/:id
    static async destroy(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const result = await ClienteService.delete(parseInt(req.params.id), tenantId);
            res.json(result);
        } catch (error) {
            console.error('Error al eliminar cliente:', error);
            responderError(res, error, 'Error al eliminar cliente');
        }
    }
}

module.exports = ClientesController;
