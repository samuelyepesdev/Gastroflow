const ProveedorService = require('../../../../services/Tenant/ProveedorService');
const { exigirMimeReal, detectarMimeReal, nombreSeguro } = require('../../../../utils/validadorArchivos');
const ProveedorFacturaService = require('../../../../services/Tenant/ProveedorFacturaService');
const ProveedorReporteRepository = require('../../../../repositories/Tenant/ProveedorReporteRepository');

class ProveedoresController {
    // GET /proveedores
    static async index(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res
                    .status(403)
                    .render('errors/generic', { error: { message: 'Contexto de tenant no disponible' } });
            }

            const proveedores = await ProveedorService.getAll(tenantId);

            res.render('proveedores/index', {
                proveedores: proveedores || [],
                user: req.user,
                tenant: req.tenant
            });
        } catch (error) {
            console.error('Error al obtener proveedores:', error);
            res.status(500).render('errors/generic', {
                error: { message: 'Error al obtener proveedores' }
            });
        }
    }

    // GET /proveedores/:id
    static async show(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const proveedor = await ProveedorService.getById(Number.parseInt(req.params.id, 10), tenantId);
            res.json(proveedor);
        } catch (error) {
            res.status(error.message === 'Proveedor no encontrado' ? 404 : 500).json({ error: error.message });
        }
    }

    // POST /proveedores
    static async store(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const result = await ProveedorService.create(tenantId, req.body);
            res.status(201).json(result);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    // PUT /proveedores/:id
    static async update(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const result = await ProveedorService.update(Number.parseInt(req.params.id, 10), tenantId, req.body);
            res.json(result);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    // DELETE /proveedores/:id
    static async destroy(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const result = await ProveedorService.delete(Number.parseInt(req.params.id, 10), tenantId);
            res.json(result);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    // --- FACTURAS DE PROVEEDORES ---

    // GET /proveedores/:id/facturas
    static async listFacturas(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const facturas = await ProveedorFacturaService.listByProveedor(
                tenantId,
                Number.parseInt(req.params.id, 10)
            );
            res.json(facturas);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // POST /proveedores/:id/facturas
    static async storeFactura(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const proveedorId = Number.parseInt(req.params.id, 10);
            if (!req.file) {
                throw new Error('No se subió ningún archivo');
            }

            const tipoReal = exigirMimeReal(req.file.buffer);

            const data = {
                proveedor_id: proveedorId,
                numero_factura: req.body.numero_factura,
                fecha_emision: req.body.fecha_emision,
                fecha_vencimiento: req.body.fecha_vencimiento || null,
                monto_total: req.body.monto_total,
                archivo_nombre: req.file.originalname,
                archivo_contenido: req.file.buffer,
                archivo_tipo: tipoReal.mime,
                archivo_size: req.file.size,
                notas: req.body.notas
            };

            const id = await ProveedorFacturaService.create(tenantId, data);
            res.status(201).json({ id, message: 'Factura cargada correctamente' });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    // GET /proveedores/facturas/:facturaId/ver
    static async showFactura(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const factura = await ProveedorFacturaService.getById(Number.parseInt(req.params.facturaId, 10), tenantId);

            // Facturas guardadas antes de validar por contenido: se vuelve a detectar al servir.
            const tipoReal = detectarMimeReal(factura.archivo_contenido);
            if (!tipoReal) {
                return res.status(415).json({ error: 'El archivo almacenado no es un PDF o imagen válido' });
            }
            res.setHeader('Content-Type', tipoReal.mime);
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
            res.setHeader(
                'Content-Disposition',
                `inline; filename="${nombreSeguro(factura.archivo_nombre, 'factura')}"`
            );
            res.send(factura.archivo_contenido);
        } catch (error) {
            res.status(404).json({ error: error.message });
        }
    }

    // PATCH /proveedores/facturas/:facturaId/pagar
    static async pagarFactura(req, res) {
        try {
            const tenantId = req.tenant?.id;
            await ProveedorFacturaService.marcarComoPagada(Number.parseInt(req.params.facturaId, 10), tenantId);
            res.json({ success: true, message: 'Factura marcada como pagada' });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    // DELETE /proveedores/facturas/:facturaId
    static async destroyFactura(req, res) {
        try {
            const tenantId = req.tenant?.id;
            await ProveedorFacturaService.delete(Number.parseInt(req.params.facturaId, 10), tenantId);
            res.json({ success: true, message: 'Factura eliminada' });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    // --- REPORTES Y ESTADÍSTICAS ---

    // GET /proveedores/:id/historial-costos
    static async getHistorialCostos(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const history = await ProveedorReporteRepository.getHistorialCostos(
                tenantId,
                Number.parseInt(req.params.id, 10)
            );
            res.json(history);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = ProveedoresController;
