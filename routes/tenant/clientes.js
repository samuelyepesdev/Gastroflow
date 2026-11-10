const express = require('express');
const router = express.Router();
const ClientesController = require('../../app/Http/Controllers/Tenant/ClientesController');
const { requirePermission } = require('../../middleware/auth');
const BaseRequest = require('../../app/Http/Requests/BaseRequest');
const StoreClienteRequest = require('../../app/Http/Requests/Tenant/StoreClienteRequest');

// Un :id que no es entero positivo es una solicitud inválida (400), no un error interno.
router.param('id', (req, res, next, id) => {
    if (!/^\d{1,18}$/.test(id)) {
        return res.status(400).json({ error: 'Identificador inválido' });
    }
    next();
});

// GET /clientes - Listado
router.get('/', requirePermission('clientes.ver'), ClientesController.index);

// GET /clientes/buscar - Buscar
router.get('/buscar', requirePermission('clientes.ver'), ClientesController.search);

// GET /clientes/:id - Ver por ID
router.get('/:id', requirePermission('clientes.ver'), ClientesController.show);

// POST /clientes - Crear (con validación modular)
router.post(
    '/',
    [requirePermission('clientes.crear'), ...BaseRequest.validate(StoreClienteRequest)],
    ClientesController.store
);

// PUT /clientes/:id - Actualizar (mismas reglas que store por ahora)
router.put(
    '/:id',
    [requirePermission('clientes.editar'), ...BaseRequest.validate(StoreClienteRequest)],
    ClientesController.update
);

// DELETE /clientes/:id - Eliminar
router.delete('/:id', requirePermission('clientes.eliminar'), ClientesController.destroy);

module.exports = router;
