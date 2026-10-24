/**
 * FidelizacionService - Tarjetas de sellos digitales.
 *
 * - La base de datos de GastroFlow es la fuente de verdad (sellos, premios, historial).
 * - Google Wallet solo refleja el estado: si falla, la venta y el sello NO se pierden;
 *   el siguiente sello o canje vuelve a escribir el estado completo en Wallet.
 * - Un cliente solo tiene tarjeta si la pidió (consentimiento explícito, Ley 1581/2012).
 */
const crypto = require('crypto');
const sharp = require('sharp');
const QRCode = require('qrcode');
const db = require('../../config/database');
const FidelizacionRepository = require('../../repositories/Tenant/FidelizacionRepository');
const ClienteRepository = require('../../repositories/Tenant/ClienteRepository');
const GoogleWalletService = require('../Shared/GoogleWalletService');
const TenantOwnership = require('./TenantOwnership');
const TenantRepository = require('../../repositories/Admin/TenantRepository');
const R2StorageService = require('./R2StorageService');
const FidelizacionDisenos = require('./FidelizacionDisenos');
const FidelizacionTarjetaPdf = require('./FidelizacionTarjetaPdf');
const { formatMoney } = require('../../utils/money');

const PROGRAMA_POR_DEFECTO = {
    nombre: 'Tarjeta de sellos',
    sellos_requeridos: 8,
    monto_minimo: 0,
    modo_sello: 'monto',
    producto_id: null,
    premio: 'Premio de la casa',
    activo: 0,
    diseno: 'cafe',
    color: null,
    lema: null,
    logo_url: null,
    mostrar_logo: 1
};

const TOKEN_RE = /^[a-f0-9]{36}$/;

const CARPETA_LOGOS = 'fidelizacion/logos';

/** Solo se aceptan logos que subimos nosotros a R2 (evita que nos hagan descargar URLs ajenas). */
const esLogoPropio = url => {
    const base = R2StorageService.publicUrl;
    if (!url || !base || typeof url !== 'string' || url.length > 500 || /[\s"'<>]/.test(url)) {
        return false;
    }
    return url.startsWith(`${base.endsWith('/') ? base : `${base}/`}${CARPETA_LOGOS}/`);
};

// Evita generar dos veces la misma imagen y llamar a Google por una clase que no cambió.
const imagenesEnCurso = new Map();
const clasesAsegurables = new Map();

/** URLs ya generadas { "<sellos>": url }; vacío si no hay caché o es de otro diseño. */
const leerImagenesWallet = (programa, firma) => {
    try {
        const cache = programa?.wallet_imagenes ? JSON.parse(programa.wallet_imagenes) : null;
        return cache?.firma === firma && cache.urls ? cache.urls : {};
    } catch {
        return {};
    }
};

const walletConfigurado = () => {
    try {
        GoogleWalletService.config();
        return true;
    } catch {
        return false;
    }
};

class FidelizacionService {
    // ---- Programa ----------------------------------------------------------

    static async obtenerPrograma(tenantId) {
        const programa = await FidelizacionRepository.obtenerPrograma(tenantId);
        return programa || { ...PROGRAMA_POR_DEFECTO, tenant_id: tenantId, configurado: false };
    }

    static async guardarPrograma(tenantId, datos = {}) {
        const sellosRequeridos = Number.parseInt(datos.sellos_requeridos, 10);
        const montoMinimo = Number.parseFloat(datos.monto_minimo || 0);
        const nombre = String(datos.nombre || PROGRAMA_POR_DEFECTO.nombre)
            .trim()
            .slice(0, 80);
        const premio = String(datos.premio || '')
            .trim()
            .slice(0, 120);
        if (!Number.isInteger(sellosRequeridos) || sellosRequeridos < 2 || sellosRequeridos > 20) {
            throw new Error('Los sellos requeridos deben ser un número entre 2 y 20');
        }
        if (!Number.isFinite(montoMinimo) || montoMinimo < 0) {
            throw new Error('El monto mínimo no puede ser negativo');
        }
        const modoSello = datos.modo_sello === 'producto' ? 'producto' : 'monto';
        let productoId = null;
        if (modoSello === 'producto') {
            productoId = Number.parseInt(datos.producto_id, 10);
            if (!Number.isInteger(productoId) || productoId < 1) {
                throw new Error('Elige el producto de la carta que da el sello');
            }
            // El id viene del navegador: debe ser un producto de este restaurante.
            await TenantOwnership.productos(tenantId, [productoId]);
        }
        if (!premio) {
            throw new Error('Indica cuál es el premio');
        }
        if (!nombre) {
            throw new Error('Indica el nombre del programa');
        }
        const color = datos.color ? String(datos.color).trim() : null;
        if (color && !FidelizacionDisenos.colorValido(color)) {
            throw new Error('El color debe tener el formato #RRGGBB');
        }
        const logoUrl = datos.logo_url ? String(datos.logo_url).trim() : null;
        if (logoUrl && !esLogoPropio(logoUrl)) {
            throw new Error('El logo no es válido: súbelo de nuevo desde esta pantalla');
        }
        const anterior = await FidelizacionRepository.obtenerPrograma(tenantId);
        const guardado = await FidelizacionRepository.guardarPrograma(tenantId, {
            nombre,
            sellosRequeridos,
            // En modo producto el monto no aplica: se guarda en 0 para no dejar una regla fantasma.
            montoMinimo: modoSello === 'producto' ? 0 : montoMinimo,
            modoSello,
            productoId,
            premio,
            activo: datos.activo === undefined ? true : Boolean(datos.activo),
            diseno: FidelizacionDisenos.disenoValido(datos.diseno),
            color,
            lema:
                String(datos.lema || '')
                    .trim()
                    .slice(0, 60) || null,
            logoUrl,
            mostrarLogo: datos.mostrar_logo === undefined ? true : Boolean(datos.mostrar_logo)
        });
        // Si cambió o quitó el logo propio, el archivo anterior ya no se usa.
        if (anterior?.logo_url && anterior.logo_url !== logoUrl) {
            R2StorageService.deleteFile(anterior.logo_url).catch(() => {});
        }
        // Deja lista la clase y las imágenes del pase sin hacer esperar al usuario.
        FidelizacionService.prepararWallet(tenantId).catch(() => {});
        return guardado;
    }

    // ---- Diseño de la tarjeta ------------------------------------------------

    /** Sube el logo propio de la tarjeta a R2 (PNG de hasta 512 px). El programa lo guarda al "Guardar diseño". */
    static async subirLogo(archivo) {
        if (!archivo?.buffer) {
            throw new Error('Selecciona una imagen');
        }
        let png;
        try {
            png = await sharp(archivo.buffer)
                .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
                .png()
                .toBuffer();
        } catch {
            throw new Error('El archivo no es una imagen válida');
        }
        try {
            return { url: await R2StorageService.uploadFile(png, 'logo.png', 'image/png', CARPETA_LOGOS) };
        } catch {
            throw new Error('No se pudo guardar el logo: revisa que el almacenamiento de imágenes esté configurado');
        }
    }

    /**
     * Lo necesario para pintar la tarjeta de un programa (guardado o borrador): acento, textos
     * y de dónde sale el logo (el propio de la tarjeta, o el del negocio).
     */
    static async _contextoDiseno(tenantId, programa) {
        const tenant = await TenantRepository.findById(tenantId);
        const diseno = FidelizacionDisenos.disenoValido(programa?.diseno);
        const color = FidelizacionDisenos.colorAcento(diseno, programa?.color);
        const mostrarLogo = !['0', 'false', 'no'].includes(String(programa?.mostrar_logo ?? 1));
        const logoFuente = mostrarLogo ? programa?.logo_url || tenant?.logo_src || null : null;
        return {
            tenant,
            diseno,
            color,
            fondoWallet: FidelizacionDisenos.fondoWallet(diseno, color),
            restaurante: tenant?.nombre || 'Restaurante',
            lema: programa?.lema || '',
            premio: programa?.premio || PROGRAMA_POR_DEFECTO.premio,
            total: programa?.sellos_requeridos || PROGRAMA_POR_DEFECTO.sellos_requeridos,
            logoFuente,
            // Wallet solo trae logos por URL https pública
            logoPublico: /^https:\/\//.test(logoFuente || '') ? logoFuente : null
        };
    }

    /** Datos listos para FidelizacionDisenos.componer / aPng (con el logo ya convertido). */
    static async _datosTarjeta(ctx, extra = {}) {
        return {
            diseno: ctx.diseno,
            color: ctx.color,
            restaurante: ctx.restaurante,
            lema: ctx.lema,
            premio: ctx.premio,
            total: ctx.total,
            logo: await FidelizacionDisenos.cargarLogo(ctx.logoFuente),
            ...extra
        };
    }

    /** Catálogo de diseños con miniaturas (con el logo y los textos del local) para el selector. */
    static async listarDisenos(tenantId) {
        const programa = await FidelizacionRepository.obtenerPrograma(tenantId);
        const ctx = await FidelizacionService._contextoDiseno(tenantId, programa);
        const datos = await FidelizacionService._datosTarjeta(ctx);
        return {
            disenos: FidelizacionDisenos.listarParaUI(datos),
            logoNegocio: Boolean(ctx.tenant?.logo_src)
        };
    }

    /** SVG de vista previa de un borrador (diseño, color, lema, logo...) que aún no se ha guardado. */
    static async vistaPreviaDiseno(tenantId, q = {}) {
        const base = (await FidelizacionRepository.obtenerPrograma(tenantId)) || PROGRAMA_POR_DEFECTO;
        const borrador = {
            ...base,
            diseno: q.diseno,
            color: FidelizacionDisenos.colorValido(q.color) ? q.color : null,
            lema: String(q.lema ?? '').slice(0, 60),
            premio: String(q.premio || base.premio).slice(0, 120),
            sellos_requeridos: Number.parseInt(q.total, 10) || base.sellos_requeridos,
            logo_url: esLogoPropio(q.logo) ? q.logo : null,
            mostrar_logo: q.sinlogo === '1' ? 0 : 1
        };
        const ctx = await FidelizacionService._contextoDiseno(tenantId, borrador);
        const datos = await FidelizacionService._datosTarjeta(ctx, { sellos: Number.parseInt(q.sellos, 10) || 0 });
        return FidelizacionDisenos.componer(datos);
    }

    // ---- Tarjetas ----------------------------------------------------------

    static async inscribir(tenantId, { clienteId, consentimiento }) {
        if (!consentimiento) {
            throw new Error('El cliente debe autorizar el tratamiento de sus datos para tener la tarjeta');
        }
        await TenantOwnership.clientes(tenantId, clienteId);
        const programa = await FidelizacionRepository.obtenerPrograma(tenantId);
        if (!programa || !programa.activo) {
            throw new Error('Primero configura y activa el programa de sellos');
        }
        const existente = await FidelizacionRepository.obtenerTarjetaPorCliente(tenantId, clienteId);
        if (existente) {
            return { tarjeta: FidelizacionService._publica(existente), nueva: false };
        }

        return FidelizacionService._crearTarjetaNueva(tenantId, clienteId, { origen: 'caja' });
    }

    static async _crearTarjetaNueva(tenantId, clienteId, { origen, ip = null }) {
        for (let intento = 0; intento < 5; intento++) {
            const numero = `GF${crypto.randomInt(10000000, 99999999)}`;
            const tokenPublico = crypto.randomBytes(18).toString('hex');
            try {
                const id = await FidelizacionRepository.crearTarjeta({
                    tenantId,
                    clienteId,
                    numero,
                    tokenPublico,
                    origen,
                    ip
                });
                const tarjeta = await FidelizacionRepository.obtenerTarjetaPorId(tenantId, id);
                return { tarjeta: FidelizacionService._publica(tarjeta), nueva: true };
            } catch (error) {
                if (error.code !== 'ER_DUP_ENTRY') {
                    throw error;
                }
                const yaCreada = await FidelizacionRepository.obtenerTarjetaPorCliente(tenantId, clienteId);
                if (yaCreada) {
                    return { tarjeta: FidelizacionService._publica(yaCreada), nueva: false };
                }
            }
        }
        throw new Error('No se pudo generar la tarjeta, intenta de nuevo');
    }

    // ---- Autoinscripción por QR --------------------------------------------

    static urlInscripcion(token) {
        const base = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
        return `${base}/tarjeta/unirse/${token}`;
    }

    /** Enlace y QR (imagen) que el restaurante imprime. Crea el token la primera vez. */
    static async obtenerInscripcionQR(tenantId, { regenerar = false } = {}) {
        const programa = await FidelizacionRepository.obtenerPrograma(tenantId);
        if (!programa) {
            throw new Error('Primero configura el programa de sellos');
        }
        let token = programa.token_inscripcion;
        if (!token || regenerar) {
            token = crypto.randomBytes(18).toString('hex');
            await FidelizacionRepository.guardarTokenInscripcion(tenantId, token);
        }
        const url = FidelizacionService.urlInscripcion(token);
        const qr = await QRCode.toDataURL(url, { margin: 2, width: 600 });
        return { url, qr, activo: Boolean(programa.activo) };
    }

    /** Cómo se gana un sello, en una frase para el cliente. */
    static textoRegla(programa) {
        if (programa.modo_sello === 'producto' && programa.producto_nombre) {
            return `Cada compra que incluya ${programa.producto_nombre} suma un sello.`;
        }
        return Number(programa.monto_minimo) > 0
            ? `Cada compra desde ${formatMoney(programa.monto_minimo)} suma un sello.`
            : 'Cada compra suma un sello.';
    }

    /** Productos de la carta para elegir el que da el sello. */
    static listarProductos(tenantId) {
        return FidelizacionRepository.listarProductos(tenantId);
    }

    /** PDF imprimible (tarjeta con el diseño del local y su QR de inscripción). */
    static async tarjetaQrPdf(tenantId) {
        const { qr } = await FidelizacionService.obtenerInscripcionQR(tenantId);
        const programa = await FidelizacionRepository.obtenerPrograma(tenantId);
        const ctx = await FidelizacionService._contextoDiseno(tenantId, programa);
        const regla = FidelizacionService.textoRegla(programa);
        const datos = await FidelizacionService._datosTarjeta(ctx, {
            modo: 'impreso',
            programa: programa.nombre,
            regla,
            qr
        });
        // x2 para que el texto y el QR salgan nítidos al imprimir
        return FidelizacionTarjetaPdf.render(await FidelizacionDisenos.aPng(datos, 2), ctx.restaurante);
    }

    /** Datos para pintar el formulario público (o null si el enlace no sirve). */
    static async vistaInscripcion(token) {
        if (!TOKEN_RE.test(String(token))) {
            return null;
        }
        const programa = await FidelizacionRepository.obtenerProgramaPorTokenInscripcion(token);
        if (!programa || !programa.activo) {
            return null;
        }
        return {
            restaurante: await FidelizacionService._nombreRestaurante(programa.tenant_id),
            total: programa.sellos_requeridos,
            premio: programa.premio
        };
    }

    /**
     * Inscripción hecha por el propio cliente desde el QR. Crea (o reutiliza) su ficha de
     * cliente y su tarjeta. Si ese teléfono ya tiene tarjeta NO se devuelve su enlace: sin
     * verificar el teléfono, cualquiera podría abrir la tarjeta de otra persona.
     */
    static async inscribirPorQR(token, { nombre, telefono, email, consentimiento, ip }) {
        const vista = await FidelizacionService.vistaInscripcion(token);
        if (!vista) {
            throw new Error('Este enlace de inscripción no es válido o ya no está activo');
        }
        if (!consentimiento) {
            throw new Error('Debes autorizar el tratamiento de tus datos para recibir la tarjeta');
        }

        const nombreLimpio = String(nombre || '')
            .trim()
            .replace(/\s+/g, ' ');
        if (nombreLimpio.length < 2 || nombreLimpio.length > 80) {
            throw new Error('Escribe tu nombre');
        }
        const tel = FidelizacionService._normalizarTelefono(telefono);
        if (!tel) {
            throw new Error('Escribe un celular colombiano válido (10 dígitos)');
        }
        const correo = String(email || '')
            .trim()
            .toLowerCase();
        if (correo && (correo.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo))) {
            throw new Error('El correo no es válido');
        }

        const programa = await FidelizacionRepository.obtenerProgramaPorTokenInscripcion(token);
        const tenantId = programa.tenant_id;

        let cliente = await FidelizacionRepository.buscarClientePorTelefono(tenantId, tel);
        if (cliente) {
            const existente = await FidelizacionRepository.obtenerTarjetaPorCliente(tenantId, cliente.id);
            if (existente) {
                return { yaInscrito: true };
            }
        } else {
            const r = await ClienteRepository.create(tenantId, {
                nombre: nombreLimpio,
                telefono: tel,
                email: correo || null
            });
            cliente = { id: r.insertId };
        }

        const { tarjeta } = await FidelizacionService._crearTarjetaNueva(tenantId, cliente.id, { origen: 'qr', ip });
        return { yaInscrito: false, token: tarjeta.token_publico };
    }

    /** Devuelve los 10 dígitos del celular colombiano o null. */
    static _normalizarTelefono(valor) {
        const digitos = String(valor || '').replace(/\D/g, '');
        const sin57 = digitos.length === 12 && digitos.startsWith('57') ? digitos.slice(2) : digitos;
        return /^3\d{9}$/.test(sin57) ? sin57 : null;
    }

    static async listar(tenantId, filtros = {}) {
        const tarjetas = await FidelizacionRepository.listarTarjetas(tenantId, filtros);
        return tarjetas.map(FidelizacionService._publica);
    }

    static async obtenerPorCliente(tenantId, clienteId) {
        const t = await FidelizacionRepository.obtenerTarjetaPorCliente(tenantId, clienteId);
        return t ? FidelizacionService._publica(t) : null;
    }

    static async detalle(tenantId, tarjetaId) {
        const t = await FidelizacionRepository.obtenerTarjetaPorId(tenantId, tarjetaId);
        if (!t) {
            throw new Error('Tarjeta no encontrada');
        }
        const movimientos = await FidelizacionRepository.listarMovimientos(tenantId, tarjetaId);
        return { tarjeta: FidelizacionService._publica(t), movimientos };
    }

    // ---- Sello por factura ---------------------------------------------------

    /**
     * Suma el sello de una factura. Seguro de llamar varias veces para la misma factura
     * (idempotente). Nunca lanza: una falla aquí no debe afectar la venta ya cobrada.
     */
    static async sellarPorFactura({ tenantId, facturaId, clienteId, total, usuarioId = null }) {
        try {
            if (!clienteId) {
                return { sellado: false, motivo: 'sin_cliente' };
            }
            const programa = await FidelizacionRepository.obtenerPrograma(tenantId);
            if (!programa || !programa.activo) {
                return { sellado: false, motivo: 'programa_inactivo' };
            }
            if (programa.modo_sello === 'producto') {
                // Sin producto elegido (o eliminado de la carta) no se sella: nunca a ciegas.
                if (!programa.producto_id) {
                    return { sellado: false, motivo: 'producto_no_configurado' };
                }
                const incluye = await FidelizacionRepository.facturaTieneProducto(
                    tenantId,
                    facturaId,
                    programa.producto_id
                );
                if (!incluye) {
                    return { sellado: false, motivo: 'sin_producto' };
                }
            } else if (Number(total) < Number(programa.monto_minimo)) {
                return { sellado: false, motivo: 'monto_insuficiente' };
            }

            const resultado = await FidelizacionService._aplicarSello({
                tenantId,
                facturaId,
                clienteId,
                usuarioId,
                programa
            });
            if (resultado.sellado) {
                FidelizacionService.sincronizarWallet(tenantId, resultado.tarjetaId, {
                    avisar: resultado.premioGanado
                }).catch(() => {});
            }
            return resultado;
        } catch (error) {
            console.error('Fidelización: no se pudo sellar la factura', facturaId, error.message);
            return { sellado: false, motivo: 'error' };
        }
    }

    static async _aplicarSello({ tenantId, facturaId, clienteId, usuarioId, programa }) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            const tarjeta = await FidelizacionRepository.obtenerTarjetaPorCliente(
                tenantId,
                clienteId,
                connection,
                true
            );
            if (!tarjeta || tarjeta.estado !== 'activa') {
                await connection.rollback();
                return { sellado: false, motivo: 'sin_tarjeta' };
            }
            const nuevo = await FidelizacionRepository.registrarMovimiento(connection, {
                tenantId,
                tarjetaId: tarjeta.id,
                tipo: 'sello',
                facturaId,
                usuarioId
            });
            if (!nuevo) {
                await connection.rollback();
                return { sellado: false, motivo: 'ya_sellada' };
            }

            let sellos = tarjeta.sellos + 1;
            let premiosDisponibles = tarjeta.premios_disponibles;
            let premioGanado = false;
            if (sellos >= programa.sellos_requeridos) {
                sellos = 0;
                premiosDisponibles += 1;
                premioGanado = true;
                await FidelizacionRepository.registrarMovimiento(connection, {
                    tenantId,
                    tarjetaId: tarjeta.id,
                    tipo: 'premio_ganado',
                    facturaId,
                    usuarioId
                });
            }
            await FidelizacionRepository.actualizarContadores(connection, tarjeta.id, {
                sellos,
                sellosHistoricos: tarjeta.sellos_historicos + 1,
                premiosDisponibles,
                premiosCanjeados: tarjeta.premios_canjeados
            });
            await connection.commit();
            return { sellado: true, tarjetaId: tarjeta.id, sellos, premiosDisponibles, premioGanado };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    // ---- Canje ---------------------------------------------------------------

    static async canjear(tenantId, tarjetaId, usuarioId = null) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            const tarjeta = await FidelizacionRepository.obtenerTarjetaPorId(tenantId, tarjetaId, connection, true);
            if (!tarjeta) {
                throw new Error('Tarjeta no encontrada');
            }
            if (tarjeta.estado !== 'activa') {
                throw new Error('La tarjeta está anulada');
            }
            if (tarjeta.premios_disponibles < 1) {
                throw new Error('Esta tarjeta no tiene premios por canjear');
            }
            await FidelizacionRepository.registrarMovimiento(connection, {
                tenantId,
                tarjetaId,
                tipo: 'canje',
                usuarioId
            });
            await FidelizacionRepository.actualizarContadores(connection, tarjetaId, {
                sellos: tarjeta.sellos,
                sellosHistoricos: tarjeta.sellos_historicos,
                premiosDisponibles: tarjeta.premios_disponibles - 1,
                premiosCanjeados: tarjeta.premios_canjeados + 1
            });
            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
        FidelizacionService.sincronizarWallet(tenantId, tarjetaId, { avisar: false }).catch(() => {});
        return FidelizacionService.detalle(tenantId, tarjetaId);
    }

    // ---- Google Wallet -------------------------------------------------------

    /**
     * URL pública de la imagen del pase con N sellos pintados. Se genera una vez por
     * (diseño, color, total, sellos) y se guarda en el programa: cambiar el diseño la invalida.
     * Devuelve null si no hay almacenamiento (R2) o falla: el pase sale igual, sin imagen.
     */
    static async _imagenWallet(tenantId, programa, ctx, sellos) {
        const total = programa.sellos_requeridos;
        const n = Math.max(0, Math.min(Number(sellos) || 0, total));
        // Todo lo que se ve en la imagen: si cambia algo, las anteriores dejan de servir.
        const firma = crypto
            .createHash('sha1')
            .update(
                JSON.stringify([ctx.diseno, ctx.color, ctx.restaurante, ctx.lema, ctx.premio, total, ctx.logoFuente])
            )
            .digest('hex')
            .slice(0, 16);
        const urlsGuardadas = leerImagenesWallet(programa, firma);
        if (urlsGuardadas[n]) {
            return urlsGuardadas[n];
        }
        const clave = `${tenantId}|${firma}|${n}`;
        if (!imagenesEnCurso.has(clave)) {
            imagenesEnCurso.set(
                clave,
                (async () => {
                    const png = await FidelizacionDisenos.aPng(
                        await FidelizacionService._datosTarjeta(ctx, { sellos: n })
                    );
                    const url = await R2StorageService.uploadFile(png, `sellos-${n}.png`, 'image/png', 'fidelizacion');
                    // Relee el programa: otra imagen pudo guardarse mientras esta se generaba.
                    const actual = await FidelizacionRepository.obtenerPrograma(tenantId);
                    await FidelizacionRepository.guardarImagenesWallet(tenantId, {
                        firma,
                        urls: { ...leerImagenesWallet(actual, firma), [n]: url }
                    });
                    return url;
                })().finally(() => imagenesEnCurso.delete(clave))
            );
        }
        try {
            return await imagenesEnCurso.get(clave);
        } catch (error) {
            console.error('Fidelización: no se pudo generar la imagen del pase:', error.message);
            return null;
        }
    }

    /** Crea o actualiza la clase de Wallet del restaurante (solo si su diseño cambió desde la última vez). */
    static async _asegurarClaseWallet(tenantId, programa, ctx) {
        const cfg = GoogleWalletService.config();
        const classId = GoogleWalletService.classIdPara(cfg, tenantId);
        const heroUrl = await FidelizacionService._imagenWallet(tenantId, programa, ctx, 0);
        const firma = [ctx.fondoWallet, ctx.restaurante, programa.nombre, ctx.logoPublico, heroUrl].join('|');
        if (clasesAsegurables.get(tenantId) !== firma) {
            await GoogleWalletService.asegurarClase({
                classId,
                restaurante: ctx.restaurante,
                programa: programa.nombre,
                color: ctx.fondoWallet,
                logoUrl: ctx.logoPublico,
                heroUrl
            });
            clasesAsegurables.set(tenantId, firma);
        }
        return classId;
    }

    /** Deja lista la clase del restaurante y la imagen base tras guardar el programa. Nunca lanza. */
    static async prepararWallet(tenantId) {
        if (!walletConfigurado()) {
            return;
        }
        try {
            const programa = await FidelizacionRepository.obtenerPrograma(tenantId);
            if (!programa) {
                return;
            }
            const ctx = await FidelizacionService._contextoDiseno(tenantId, programa);
            await FidelizacionService._asegurarClaseWallet(tenantId, programa, ctx);
        } catch (error) {
            console.error('Fidelización: no se pudo preparar Wallet:', error.message);
        }
    }

    /** Crea o actualiza la tarjeta en Wallet con los datos actuales. Devuelve el enlace de guardado. */
    static async sincronizarWallet(tenantId, tarjetaId, { avisar = false } = {}) {
        if (!walletConfigurado()) {
            return { sincronizada: false, motivo: 'wallet_no_configurado' };
        }
        try {
            const tarjeta = await FidelizacionRepository.obtenerTarjetaPorId(tenantId, tarjetaId);
            if (!tarjeta) {
                throw new Error('Tarjeta no encontrada');
            }
            const programa = await FidelizacionRepository.obtenerPrograma(tenantId);
            const ctx = await FidelizacionService._contextoDiseno(tenantId, programa);
            const restaurante = ctx.restaurante;
            // Con premio por canjear la tarjeta se ve completa.
            const sellosVisibles = tarjeta.premios_disponibles > 0 ? programa.sellos_requeridos : tarjeta.sellos;
            const heroUrl = await FidelizacionService._imagenWallet(tenantId, programa, ctx, sellosVisibles);
            const datos = {
                numeroTarjeta: tarjeta.numero,
                nombre: tarjeta.cliente_nombre,
                token: tarjeta.token_publico,
                sellos: tarjeta.sellos,
                total: programa.sellos_requeridos,
                premio: programa.premio,
                premiosDisponibles: tarjeta.premios_disponibles,
                restaurante,
                heroUrl
            };
            let enlace;
            if (tarjeta.wallet_sincronizada_at) {
                // Ya existe en Google: basta un PATCH con el estado nuevo.
                try {
                    await GoogleWalletService.actualizarTarjeta(tarjeta.numero, {
                        sellos: datos.sellos,
                        total: datos.total,
                        premio: datos.premio,
                        premiosDisponibles: datos.premiosDisponibles,
                        restaurante: datos.restaurante,
                        heroUrl
                    });
                    enlace = GoogleWalletService.enlaceDeTarjeta(tarjeta.numero);
                } catch {
                    datos.classId = await FidelizacionService._asegurarClaseWallet(tenantId, programa, ctx);
                    enlace = (await GoogleWalletService.crearTarjeta(datos)).enlace;
                }
            } else {
                // Tarjeta nueva: primero la clase del restaurante (su color, logo e imagen), luego el pase.
                datos.classId = await FidelizacionService._asegurarClaseWallet(tenantId, programa, ctx);
                // POST y, si ya existía, PATCH.
                enlace = (await GoogleWalletService.crearTarjeta(datos)).enlace;
            }
            if (avisar) {
                await GoogleWalletService.enviarMensaje(
                    tarjeta.numero,
                    '¡Ganaste un premio!',
                    `Completaste tu tarjeta en ${restaurante}. Pide tu premio: ${programa.premio}.`,
                    true
                ).catch(error => console.error('Fidelización: aviso de premio falló:', error.message));
            }
            await FidelizacionRepository.marcarSincronizada(tarjeta.id);
            return { sincronizada: true, enlace };
        } catch (error) {
            console.error('Fidelización: no se pudo sincronizar con Wallet:', error.message);
            return { sincronizada: false, motivo: 'error_wallet', error: error.message };
        }
    }

    /** Enlace "Agregar a Google Wallet" (crea el pase en Google si aún no existe). */
    static async enlaceWallet(tenantId, tarjetaId) {
        const r = await FidelizacionService.sincronizarWallet(tenantId, tarjetaId);
        if (!r.sincronizada) {
            throw new Error(
                r.motivo === 'wallet_no_configurado'
                    ? 'Google Wallet no está configurado en el servidor'
                    : 'No se pudo preparar la tarjeta en Google Wallet'
            );
        }
        return r.enlace;
    }

    // ---- Página pública (por token) --------------------------------------------

    static async vistaPublica(token) {
        if (!/^[a-f0-9]{36}$/.test(String(token))) {
            return null;
        }
        const t = await FidelizacionRepository.obtenerTarjetaPorToken(token);
        if (!t) {
            return null;
        }
        const programa = await FidelizacionRepository.obtenerPrograma(t.tenant_id);
        if (!programa) {
            return null;
        }
        return {
            numero: t.numero,
            cliente: t.cliente_nombre,
            restaurante: await FidelizacionService._nombreRestaurante(t.tenant_id),
            sellos: t.sellos,
            total: programa.sellos_requeridos,
            premio: programa.premio,
            premiosDisponibles: t.premios_disponibles
        };
    }

    static async enlaceWalletPublico(token) {
        if (!/^[a-f0-9]{36}$/.test(String(token))) {
            return null;
        }
        const t = await FidelizacionRepository.obtenerTarjetaPorToken(token);
        if (!t) {
            return null;
        }
        return FidelizacionService.enlaceWallet(t.tenant_id, t.id);
    }

    // ---- Utilidades ----------------------------------------------------------

    static async _nombreRestaurante(tenantId) {
        try {
            const [rows] = await db.query('SELECT nombre FROM tenants WHERE id = ?', [tenantId]);
            return rows[0]?.nombre || 'Restaurante';
        } catch {
            return 'Restaurante';
        }
    }

    /** Lo que se devuelve al frontend: sin el token interno de escritura, con el enlace público. */
    static _publica(t) {
        return {
            id: t.id,
            cliente_id: t.cliente_id,
            cliente_nombre: t.cliente_nombre,
            cliente_telefono: t.cliente_telefono,
            numero: t.numero,
            token_publico: t.token_publico,
            sellos: t.sellos,
            sellos_historicos: t.sellos_historicos,
            premios_disponibles: t.premios_disponibles,
            premios_canjeados: t.premios_canjeados,
            estado: t.estado,
            wallet_sincronizada_at: t.wallet_sincronizada_at
        };
    }
}

module.exports = FidelizacionService;
