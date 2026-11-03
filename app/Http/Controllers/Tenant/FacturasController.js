const FacturaService = require('../../../../services/Tenant/FacturaService');
const EventoService = require('../../../../services/Tenant/EventoService');
const ConfiguracionService = require('../../../../services/Tenant/ConfiguracionService');
const { toFechaISOUtc, toFechaDia, hoyColombia } = require('../../../../utils/dateHelpers');

class FacturasController {
    // GET /facturas/facturar
    static async facturar(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res
                    .status(403)
                    .render('errors/internal', { error: { message: 'Contexto de tenant no disponible' } });
            }
            let eventoFiltro = null;
            let fechaVenta = null;
            if (req.query.evento_id) {
                const ev = await EventoService.getById(req.query.evento_id, tenantId);
                if (ev) {
                    eventoFiltro = { id: ev.id, nombre: ev.nombre };
                    // Días en que se puede registrar la venta: los del evento que ya llegaron (nunca futuros).
                    const hoy = hoyColombia();
                    const min = toFechaDia(ev.fecha_inicio);
                    const fin = toFechaDia(ev.fecha_fin);
                    const max = fin < hoy ? fin : hoy;
                    if (min <= max) {
                        fechaVenta = { min, max, valor: hoy >= min && hoy <= fin ? hoy : max };
                    }
                }
            }
            res.render('pos/facturar_evento', {
                user: req.user,
                tenant: req.tenant,
                eventoFiltro: eventoFiltro || null,
                fechaVenta
            });
        } catch (error) {
            console.error('Error al cargar pantalla de facturación:', error);
            res.status(500).render('errors/internal', { error, user: req.user });
        }
    }

    // POST /facturas
    static async store(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const result = await FacturaService.create(tenantId, {
                ...req.body,
                usuario_id: req.user.id
            });
            res.status(201).json(result);
        } catch (error) {
            console.error('Error al crear factura:', error);
            if (error.message === 'Datos incompletos' || error.status === 400) {
                return res.status(400).json({ error: error.message });
            }
            res.status(500).json({ error: 'Error al crear factura' });
        }
    }

    // GET /facturas/:id/imprimir
    static async imprimir(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const facturaId = parseInt(req.params.id);
            const { factura, detalles } = await FacturaService.getByIdForPrint(facturaId, tenantId);

            const config = await ConfiguracionService.getForPreview(tenantId);
            const returnUrl = req.query.return && typeof req.query.return === 'string' ? req.query.return : '/ventas';
            factura.fechaISO = toFechaISOUtc(factura.fecha);

            res.render('facturas/impresion', {
                factura,
                detalles,
                config,
                tenant: req.tenant,
                returnUrl
            });
        } catch (error) {
            console.error('Error al obtener datos de factura:', error);
            if (
                error.message === 'Factura no encontrada' ||
                error.message.includes('detalles') ||
                error.message.includes('configurado')
            ) {
                return res.status(404).json({ error: error.message });
            }
            return res.status(500).json({ error: 'Error al obtener datos de factura' });
        }
    }

    // GET /facturas/:id/imprimir-json - Datos de la factura en JSON para impresión
    // ESC/POS del lado del cliente (QZ Tray no puede recibir HTML renderizado).
    static async imprimirJson(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const facturaId = parseInt(req.params.id);
            const { factura, detalles } = await FacturaService.getByIdForPrint(facturaId, tenantId);

            const config = await ConfiguracionService.getForPreview(tenantId);
            const printer = await ConfiguracionService.getPrinterConfig(tenantId);
            factura.fechaISO = toFechaISOUtc(factura.fecha);

            res.json({ factura, detalles, config, tenant: req.tenant, printer });
        } catch (error) {
            console.error('Error al obtener datos de factura (JSON):', error);
            if (
                error.message === 'Factura no encontrada' ||
                error.message.includes('detalles') ||
                error.message.includes('configurado')
            ) {
                return res.status(404).json({ error: error.message });
            }
            return res.status(500).json({ error: 'Error al obtener datos de factura' });
        }
    }

    // GET /facturas/:id/detalles
    static async getDetalles(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const facturaId = parseInt(req.params.id);
            const details = await FacturaService.getDetails(facturaId, tenantId);
            res.json(details);
        } catch (error) {
            console.error('Error al obtener detalles de la factura:', error);
            if (error.message === 'Factura no encontrada') {
                return res.status(404).json({ error: error.message });
            }
            res.status(500).json({ error: 'Error al obtener detalles de la factura' });
        }
    }

    // POST /facturas/:id/facturacion-electronica/reintentar
    static async reintentarFacturacionElectronica(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const FacturaElectronicaRepository = require('../../../../repositories/Tenant/FacturaElectronicaRepository');
            const facturaId = parseInt(req.params.id, 10);
            const reintentado = await FacturaElectronicaRepository.reintentar(facturaId, tenantId);
            if (!reintentado) {
                return res
                    .status(404)
                    .json({ error: 'No hay una emisión electrónica pendiente/errónea para esta factura' });
            }
            res.json({ message: 'Reintento programado' });
        } catch (error) {
            console.error('Error al reintentar facturación electrónica:', error);
            res.status(500).json({ error: 'Error al reintentar facturación electrónica' });
        }
    }
}

module.exports = FacturasController;
