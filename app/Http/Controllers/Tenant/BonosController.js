const BonoService = require('../../../../services/Tenant/BonoService');

class BonosController {
    // GET /bonos
    static async index(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res
                    .status(403)
                    .render('errors/generic', { error: { message: 'Contexto de tenant no disponible' } });
            }
            const bonos = await BonoService.listar(tenantId, { estado: req.query.estado, q: req.query.q });
            res.render('bonos/index', {
                bonos: bonos || [],
                filtroEstado: req.query.estado || '',
                filtroQ: req.query.q || '',
                user: req.user,
                tenant: req.tenant
            });
        } catch (error) {
            console.error('Error al obtener bonos:', error);
            res.status(500).render('errors/generic', { error: { message: 'Error al obtener bonos' } });
        }
    }

    // POST /bonos
    static async store(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const { valor, origen, cliente_id, fecha_vencimiento, nota, plantilla, destinatario, remitente, mensaje } =
                req.body;
            const bono = await BonoService.crear(tenantId, {
                valor,
                origen,
                cliente_id: cliente_id || null,
                fecha_vencimiento: fecha_vencimiento || null,
                nota,
                plantilla,
                destinatario,
                remitente,
                mensaje,
                usuarioId: req.user?.id || null
            });
            res.status(201).json(bono);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    // GET /bonos/plantillas - catálogo de diseños para el formulario de emisión
    static plantillas(req, res) {
        res.json(BonoService.listarPlantillas(req.tenant?.config?.colores?.primary));
    }

    // POST /bonos/vista-previa - PDF de muestra con el diseño elegido (no emite nada)
    static async vistaPrevia(req, res) {
        try {
            const buffer = await BonoService.vistaPrevia(req.tenant?.id, req.body || {});
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'inline; filename="vista-previa-bono.pdf"');
            res.send(buffer);
        } catch (error) {
            console.error('Error en vista previa de bono:', error);
            res.status(400).json({ error: 'No se pudo generar la vista previa' });
        }
    }

    // POST /bonos/:id/comprobante - regenerar el comprobante (opcionalmente con otro diseño)
    static async regenerarComprobante(req, res) {
        try {
            const { plantilla, destinatario, remitente, mensaje } = req.body || {};
            const result = await BonoService.regenerarComprobante(Number.parseInt(req.params.id, 10), req.tenant?.id, {
                plantilla,
                destinatario,
                remitente,
                mensaje
            });
            res.json(result);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    // GET /bonos/:id
    static async show(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const detalle = await BonoService.getDetalle(Number.parseInt(req.params.id, 10), tenantId);
            res.json(detalle);
        } catch (error) {
            res.status(404).json({ error: error.message });
        }
    }

    // PUT /bonos/:id/anular
    static async anular(req, res) {
        try {
            const tenantId = req.tenant?.id;
            await BonoService.anular(Number.parseInt(req.params.id, 10), tenantId, req.user?.id || null);
            res.json({ success: true });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    // GET /api/bonos/validar/:codigo
    // Preview de saldo antes de redimir en el checkout: solo requiere estar
    // autenticado en el tenant (no bonos.ver/gestionar) -- lo usa cualquiera
    // que pueda facturar, igual que ya puede registrar un abono.
    static async validar(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const bono = await BonoService.consultarPorCodigo(req.params.codigo, tenantId);
            res.json({
                codigo: bono.codigo,
                saldo_actual: Number.parseFloat(bono.saldo_actual),
                estado: bono.estado,
                fecha_vencimiento: bono.fecha_vencimiento
            });
        } catch (error) {
            res.status(404).json({ error: error.message });
        }
    }
}

module.exports = BonosController;
