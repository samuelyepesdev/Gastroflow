const FidelizacionService = require('../../../../services/Tenant/FidelizacionService');

const tenantDe = req => req.tenant?.id;

// Los errores de validación del servicio son mensajes pensados para el usuario (400).
const responderError = (res, error, mensajePorDefecto) => {
    const status = /no encontrad/i.test(error.message) ? 404 : 400;
    if (!error.message) {
        console.error(mensajePorDefecto, error);
    }
    res.status(status).json({ error: error.message || mensajePorDefecto });
};

class FidelizacionController {
    // GET /fidelizacion (página de administración)
    static index(req, res) {
        const permisos = req.user?.permisos || [];
        const esSuperadmin = String(req.user?.rol || '').toLowerCase() === 'superadmin';
        res.render('fidelizacion/index', {
            user: req.user,
            tenant: req.tenant,
            puedeGestionar: esSuperadmin || permisos.includes('fidelizacion.gestionar')
        });
    }

    // GET /api/fidelizacion/programa
    static async programa(req, res) {
        try {
            res.json(await FidelizacionService.obtenerPrograma(tenantDe(req)));
        } catch (error) {
            responderError(res, error, 'No se pudo obtener el programa');
        }
    }

    // GET /api/fidelizacion/productos -> productos de la carta para elegir el que da el sello
    static async productos(req, res) {
        try {
            res.json(await FidelizacionService.listarProductos(tenantDe(req)));
        } catch (error) {
            responderError(res, error, 'No se pudieron cargar los productos');
        }
    }

    // PUT /api/fidelizacion/programa
    static async guardarPrograma(req, res) {
        try {
            res.json(await FidelizacionService.guardarPrograma(tenantDe(req), req.body));
        } catch (error) {
            responderError(res, error, 'No se pudo guardar el programa');
        }
    }

    // GET /api/fidelizacion/inscripcion -> { url, qr } para imprimir el QR de autoinscripción
    static async inscripcion(req, res) {
        try {
            res.json(await FidelizacionService.obtenerInscripcionQR(tenantDe(req)));
        } catch (error) {
            responderError(res, error, 'No se pudo generar el QR de inscripción');
        }
    }

    // POST /api/fidelizacion/inscripcion/regenerar: invalida el QR anterior (p. ej. si se filtró)
    static async regenerarInscripcion(req, res) {
        try {
            res.json(await FidelizacionService.obtenerInscripcionQR(tenantDe(req), { regenerar: true }));
        } catch (error) {
            responderError(res, error, 'No se pudo regenerar el QR de inscripción');
        }
    }

    // GET /api/fidelizacion/inscripcion/tarjeta.pdf -> tarjeta imprimible con el diseño del local y su QR
    static async tarjetaQrPdf(req, res) {
        try {
            const buffer = await FidelizacionService.tarjetaQrPdf(tenantDe(req));
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'inline; filename="tarjeta-fidelizacion.pdf"');
            res.send(buffer);
        } catch (error) {
            responderError(res, error, 'No se pudo generar la tarjeta imprimible');
        }
    }

    // GET /api/fidelizacion/disenos -> catálogo de diseños con miniatura
    static async disenos(req, res) {
        try {
            res.json(await FidelizacionService.listarDisenos(tenantDe(req)));
        } catch (error) {
            responderError(res, error, 'No se pudieron cargar los diseños');
        }
    }

    // POST /api/fidelizacion/logo (multipart, campo "logo") -> { url } del logo propio de la tarjeta en R2
    static async subirLogo(req, res) {
        try {
            res.status(201).json(await FidelizacionService.subirLogo(req.file));
        } catch (error) {
            responderError(res, error, 'No se pudo subir el logo');
        }
    }

    // GET /api/fidelizacion/diseno/vista-previa?diseno=&color=&lema=&premio=&logo=&sinlogo=&sellos=&total= -> SVG (se usa en <img>)
    static async vistaPreviaDiseno(req, res) {
        try {
            const svg = await FidelizacionService.vistaPreviaDiseno(tenantDe(req), req.query);
            res.setHeader('Content-Type', 'image/svg+xml');
            res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
            res.send(svg);
        } catch (error) {
            responderError(res, error, 'No se pudo generar la vista previa');
        }
    }

    // GET /api/fidelizacion/tarjetas?q=
    static async listar(req, res) {
        try {
            res.json(await FidelizacionService.listar(tenantDe(req), { q: req.query.q }));
        } catch (error) {
            responderError(res, error, 'No se pudieron listar las tarjetas');
        }
    }

    // GET /api/fidelizacion/tarjetas/cliente/:clienteId (lo usa el POS al elegir cliente)
    static async porCliente(req, res) {
        try {
            const tarjeta = await FidelizacionService.obtenerPorCliente(tenantDe(req), Number(req.params.clienteId));
            res.json({ tarjeta });
        } catch (error) {
            responderError(res, error, 'No se pudo consultar la tarjeta');
        }
    }

    // POST /api/fidelizacion/tarjetas { cliente_id, consentimiento }
    static async inscribir(req, res) {
        try {
            const r = await FidelizacionService.inscribir(tenantDe(req), {
                clienteId: Number(req.body.cliente_id),
                consentimiento: req.body.consentimiento === true || req.body.consentimiento === 'true'
            });
            res.status(r.nueva ? 201 : 200).json(r);
        } catch (error) {
            responderError(res, error, 'No se pudo inscribir al cliente');
        }
    }

    // GET /api/fidelizacion/tarjetas/:id
    static async detalle(req, res) {
        try {
            res.json(await FidelizacionService.detalle(tenantDe(req), Number(req.params.id)));
        } catch (error) {
            responderError(res, error, 'No se pudo obtener la tarjeta');
        }
    }

    // POST /api/fidelizacion/tarjetas/:id/canjear
    static async canjear(req, res) {
        try {
            res.json(await FidelizacionService.canjear(tenantDe(req), Number(req.params.id), req.user?.id));
        } catch (error) {
            responderError(res, error, 'No se pudo canjear el premio');
        }
    }

    // GET /api/fidelizacion/tarjetas/:id/wallet -> { enlace }
    static async wallet(req, res) {
        try {
            const enlace = await FidelizacionService.enlaceWallet(tenantDe(req), Number(req.params.id));
            res.json({ enlace });
        } catch (error) {
            responderError(res, error, 'No se pudo generar el enlace de Wallet');
        }
    }
}

module.exports = FidelizacionController;
