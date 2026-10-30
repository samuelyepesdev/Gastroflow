/**
 * BonoService - Lógica de negocio de bonos redimibles: emisión, anulación,
 * consulta y validación previa a redimir (la redención en sí, dentro de la
 * transacción de facturación, vive en FacturarPedidoService + BonoRepository.redimir).
 */
const crypto = require('node:crypto');
const BonoRepository = require('../../repositories/Tenant/BonoRepository');
const { hoyColombia } = require('../../utils/dateHelpers');
const BonoPlantillas = require('./BonoPlantillas');
const TenantOwnership = require('./TenantOwnership');

// Sin 0/O ni 1/I/L: se leen en voz alta o se escriben a mano en el recibo sin
// ambigüedad (mismo criterio que los tokens de mesa/QR ya usan en el proyecto).
const CODIGO_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODIGO_LARGO = 6;
const CODIGO_INTENTOS_MAX = 10;

// El QR del comprobante contiene una URL (.../bono/<token>). Un lector de códigos
// "teclea" esa URL en el campo del bono, así que el canje acepta tanto el código
// corto como la URL completa.
const URL_BONO_REGEX = /\/bono\/([A-Za-z0-9_-]{16,64})\/?(?:[?#].*)?$/;

/** Token aleatorio de 16 caracteres (96 bits) para la página pública del bono. */
function generarTokenPublico() {
    return crypto.randomBytes(12).toString('base64url');
}

/** Plantilla válida y dedicatoria recortada al largo de las columnas. */
function normalizarDiseno({ plantilla, destinatario, remitente, mensaje }) {
    const limpio = (v, max) => {
        const t = String(v || '').trim();
        return t ? t.slice(0, max) : null;
    };
    return {
        plantilla: BonoPlantillas.obtener(plantilla).id,
        destinatario: limpio(destinatario, 60),
        remitente: limpio(remitente, 60),
        mensaje: limpio(mensaje, 160)
    };
}

class BonoService {
    static async crear(
        tenantId,
        { valor, origen, cliente_id, fecha_vencimiento, nota, usuarioId, plantilla, destinatario, remitente, mensaje }
    ) {
        const valorNum = Number.parseFloat(valor);
        if (!valorNum || valorNum <= 0) {
            throw new Error('El valor del bono debe ser mayor a 0');
        }
        if (!['comprado', 'regalo'].includes(origen)) {
            throw new Error('El origen del bono debe ser "comprado" o "regalo"');
        }
        if (fecha_vencimiento && Number.isNaN(new Date(fecha_vencimiento).getTime())) {
            throw new Error('Fecha de vencimiento inválida');
        }

        await TenantOwnership.clientes(tenantId, cliente_id);

        const codigo = await BonoService._generarCodigoUnico(tenantId);
        const tokenPublico = generarTokenPublico();
        const valorRedondeado = Math.round(valorNum * 100) / 100;
        const diseno = normalizarDiseno({ plantilla, destinatario, remitente, mensaje });

        const bonoId = await BonoRepository.create({
            tenantId,
            codigo,
            tokenPublico,
            origen,
            valorInicial: valorRedondeado,
            saldoActual: valorRedondeado,
            clienteId: cliente_id || null,
            fechaVencimiento: fecha_vencimiento || null,
            nota,
            usuarioCreadorId: usuarioId,
            ...diseno
        });

        await BonoRepository.registrarMovimiento({
            bonoId,
            tenantId,
            tipo: 'emision',
            monto: valorRedondeado,
            usuarioId
        });

        // No bloqueante: si falla la generación del comprobante (PDF + subida a
        // R2), el bono queda emitido igual, solo sin comprobante -- se puede
        // regenerar más adelante si hace falta.
        let imagenUrl = null;
        try {
            const BonoComprobanteService = require('./BonoComprobanteService');
            imagenUrl = await BonoComprobanteService.generar(tenantId, {
                codigo,
                token_publico: tokenPublico,
                origen,
                valor_inicial: valorRedondeado,
                fecha_vencimiento: fecha_vencimiento || null,
                ...diseno
            });
            if (imagenUrl) {
                await BonoRepository.actualizarImagenUrl(bonoId, tenantId, imagenUrl);
            }
        } catch (err) {
            console.error('Error al generar el comprobante del bono (no bloqueante):', err.message);
        }

        // Un bono "comprado" ya es plata real que entró a caja en este momento;
        // uno "regalo" nunca genera ingreso (al redimirse actúa como descuento
        // puro). No bloqueante: si Finanzas falla, el bono igual queda emitido
        // -- el ingreso se puede registrar manualmente después si hace falta.
        if (origen === 'comprado') {
            try {
                const FinanzasService = require('./FinanzasService');
                await FinanzasService.registrarMovimientoManual(tenantId, {
                    monto: valorRedondeado,
                    tipo: 'entrada',
                    categoria: 'Venta de bono',
                    motivo: `Venta de bono ${codigo}`,
                    usuario_id: usuarioId
                });
            } catch (err) {
                console.error('Error al registrar en Finanzas la venta del bono (no bloqueante):', err.message);
            }
        }

        return {
            id: bonoId,
            codigo,
            valor_inicial: valorRedondeado,
            saldo_actual: valorRedondeado,
            imagen_url: imagenUrl
        };
    }

    static async _generarCodigoUnico(tenantId) {
        for (let intento = 0; intento < CODIGO_INTENTOS_MAX; intento++) {
            let sufijo = '';
            for (let i = 0; i < CODIGO_LARGO; i++) {
                sufijo += CODIGO_CHARS[crypto.randomInt(0, CODIGO_CHARS.length)];
            }
            const codigo = `BONO-${sufijo}`;
            const existente = await BonoRepository.findByCodigo(codigo, tenantId);
            if (!existente) {
                return codigo;
            }
        }
        throw new Error('No se pudo generar un código de bono único, intente de nuevo');
    }

    static async anular(id, tenantId, usuarioId) {
        const bono = await BonoRepository.findById(id, tenantId);
        if (!bono) {
            throw new Error('Bono no encontrado');
        }
        if (bono.estado === 'anulado') {
            throw new Error('Este bono ya está anulado');
        }
        if (bono.estado === 'agotado') {
            throw new Error('Este bono ya se usó por completo, no se puede anular');
        }

        await BonoRepository.anular(id, tenantId);
        await BonoRepository.registrarMovimiento({
            bonoId: id,
            tenantId,
            tipo: 'anulacion',
            monto: bono.saldo_actual,
            usuarioId
        });
        return true;
    }

    /**
     * Vuelve a generar el comprobante de un bono ya emitido (p. ej. uno anterior
     * a las plantillas, o después de cambiar el logo). Permite cambiar la
     * plantilla/dedicatoria del diseño; el código, valor y vigencia no cambian.
     */
    static async regenerarComprobante(id, tenantId, cambios = {}) {
        const bono = await BonoRepository.findById(id, tenantId);
        if (!bono) {
            throw new Error('Bono no encontrado');
        }
        const diseno = normalizarDiseno({
            plantilla: cambios.plantilla ?? bono.plantilla,
            destinatario: cambios.destinatario ?? bono.destinatario,
            remitente: cambios.remitente ?? bono.remitente,
            mensaje: cambios.mensaje ?? bono.mensaje
        });
        // Bonos anteriores al token público: se les asigna uno para que el QR nuevo funcione.
        let tokenPublico = bono.token_publico;
        if (!tokenPublico) {
            tokenPublico = generarTokenPublico();
            await BonoRepository.actualizarToken(id, tenantId, tokenPublico);
        }
        const BonoComprobanteService = require('./BonoComprobanteService');
        const imagenUrl = await BonoComprobanteService.generar(tenantId, {
            codigo: bono.codigo,
            token_publico: tokenPublico,
            origen: bono.origen,
            valor_inicial: bono.valor_inicial,
            fecha_vencimiento: bono.fecha_vencimiento,
            ...diseno
        });
        if (!imagenUrl) {
            throw new Error('No se pudo generar el comprobante. Intenta de nuevo.');
        }
        await BonoRepository.actualizarDiseno(id, tenantId, { ...diseno, imagenUrl });
        return { imagen_url: imagenUrl };
    }

    /** PDF de muestra para la vista previa del formulario (no emite nada ni lo sube). */
    static async vistaPrevia(
        tenantId,
        { valor, origen, fecha_vencimiento, plantilla, destinatario, remitente, mensaje }
    ) {
        const BonoComprobanteService = require('./BonoComprobanteService');
        return BonoComprobanteService.renderBuffer(tenantId, {
            codigo: 'BONO-XXXXXX',
            token_publico: 'vista-previa-0000',
            origen: origen === 'comprado' ? 'comprado' : 'regalo',
            valor_inicial: Math.max(0, Number.parseFloat(valor) || 0),
            fecha_vencimiento: fecha_vencimiento || null,
            ...normalizarDiseno({ plantilla, destinatario, remitente, mensaje })
        });
    }

    static listarPlantillas(colorNegocio) {
        return BonoPlantillas.listarParaUI(colorNegocio || '#ff5a36');
    }

    static async listar(tenantId, filters = {}) {
        return BonoRepository.getAll(tenantId, filters);
    }

    static async getDetalle(id, tenantId) {
        const bono = await BonoRepository.findById(id, tenantId);
        if (!bono) {
            throw new Error('Bono no encontrado');
        }
        const movimientos = await BonoRepository.getMovimientos(id, tenantId);
        return { bono, movimientos };
    }

    /** Consulta liviana por código, para el preview al facturar (no bloquea ni redime). */
    static async consultarPorCodigo(codigo, tenantId) {
        const token = BonoService._extraerToken(codigo);
        const bono = token
            ? await BonoRepository.findByToken(token, tenantId)
            : await BonoRepository.findByCodigo(BonoService._normalizarCodigo(codigo), tenantId);
        if (!bono) {
            throw new Error('Código de bono no encontrado');
        }
        return bono;
    }

    /**
     * Valida un código de bono para redimirlo DENTRO de la transacción de
     * facturación (bloquea la fila con FOR UPDATE para que dos facturas
     * simultáneas no gasten el mismo saldo dos veces). Lanza si no es válido.
     * @returns {object|null} el bono bloqueado, o null si no se pasó código.
     */
    static async validarParaRedimir(tenantId, codigo, connection) {
        if (!codigo) {
            return null;
        }
        const token = BonoService._extraerToken(codigo);
        const bono = token
            ? await BonoRepository.findByTokenForUpdate(token, tenantId, connection)
            : await BonoRepository.findByCodigoForUpdate(BonoService._normalizarCodigo(codigo), tenantId, connection);
        if (!bono) {
            throw new Error('El código de bono no existe');
        }
        if (bono.estado === 'anulado') {
            throw new Error('Este bono fue anulado');
        }
        if (bono.estado === 'vencido' || (bono.fecha_vencimiento && bono.fecha_vencimiento < hoyColombia())) {
            throw new Error('Este bono está vencido');
        }
        if (bono.estado === 'agotado' || Number(bono.saldo_actual) <= 0) {
            throw new Error('Este bono ya no tiene saldo disponible');
        }
        return bono;
    }

    /** Token de la URL /bono/<token> si lo escaneado es una URL de bono; null si es un código corto. */
    static _extraerToken(entrada) {
        const m = URL_BONO_REGEX.exec(String(entrada || '').trim());
        return m ? m[1] : null;
    }

    static _normalizarCodigo(codigo) {
        return String(codigo || '')
            .trim()
            .toUpperCase();
    }

    static async marcarVencidos() {
        return BonoRepository.marcarVencidos();
    }
}

module.exports = BonoService;
