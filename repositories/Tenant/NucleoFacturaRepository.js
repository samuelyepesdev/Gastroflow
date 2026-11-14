/**
 * NucleoFacturaRepository - Pasos de bajo nivel que los dos motores de facturación hacen IGUAL
 * (FacturaRepository.createWithDetails para POS/facturación directa y FacturarPedidoService para Mesas).
 * Todo recibe la `connection` de la transacción de la venta: nada de esto abre conexiones propias.
 *
 * Lo que difiere entre motores (propina, abonos, descuentos por ítem, forma de pago, mesa) NO está aquí.
 */
const NumeracionRepository = require('./NumeracionRepository');
const BonoRepository = require('./BonoRepository');
const CajaRepository = require('./CajaRepository');
const ComboVentaRepository = require('./ComboVentaRepository');
const TaxService = require('../../services/Shared/TaxService');

class NucleoFacturaRepository {
    /**
     * Siguiente número de factura y turno de caja abierto (si lo hay) donde se registra la venta.
     * El número bloquea la fila del tenant (NumeracionRepository). El turno se lee con LOCK IN SHARE MODE:
     * una venta en curso y el cierre de caja (que lo toma FOR UPDATE) se serializan, así el teórico del cierre
     * nunca pierde una factura que se está registrando. Antes solo lo hacía POS/facturación directa; Mesas
     * leía el turno sin bloquearlo.
     * @param {Object} connection
     * @param {number} tenantId
     * @param {{sinTurno?: boolean}} [opciones] - true para ventas de otro día (evento): no entran al turno de hoy
     * @returns {Promise<{numero:number, cajaSesionId:number|null, cajaSesionUsuarioId:number|null}>}
     */
    static async obtenerNumeroYTurno(connection, tenantId, { sinTurno = false } = {}) {
        const numero = await NumeracionRepository.siguienteNumeroFactura(connection, tenantId);
        const [sesiones] = sinTurno
            ? [[]]
            : await connection.query(
                  'SELECT id, usuario_id FROM caja_sesiones WHERE tenant_id = ? AND estado = "abierta" LIMIT 1 LOCK IN SHARE MODE',
                  [tenantId]
              );
        return {
            numero,
            cajaSesionId: sesiones.length > 0 ? sesiones[0].id : null,
            cajaSesionUsuarioId: sesiones.length > 0 ? sesiones[0].usuario_id : null
        };
    }

    /** Descuenta del saldo del bono lo que cubrió esta factura (no hace nada si no hubo bono o monto). */
    static async redimirBono(connection, { bono, montoBono, tenantId, facturaId, usuarioId }) {
        if (!bono || !(montoBono > 0)) {
            return;
        }
        await BonoRepository.redimir(
            {
                bonoId: bono.id,
                tenantId,
                saldoAnterior: bono.saldo_actual,
                monto: montoBono,
                facturaId,
                usuarioId: usuarioId || null
            },
            connection
        );
    }

    /**
     * Servicios externos (p. ej. domicilio de un tercero): el cobro entra con la factura pero se le entrega al
     * proveedor en efectivo, así que se compensa con una salida de caja del turno, sin importar cómo pagó el cliente.
     */
    static async compensarServiciosExternos(
        connection,
        { tenantId, cajaSesionId, usuarioId, cajaSesionUsuarioId, facturaId, numeroFactura, monto }
    ) {
        if (!cajaSesionId || !(monto > 0)) {
            return;
        }
        await CajaRepository.registrarSalidaServicioExterno(
            {
                tenantId,
                sesionId: cajaSesionId,
                usuarioId: usuarioId || cajaSesionUsuarioId,
                facturaId,
                numeroFactura,
                monto
            },
            connection
        );
    }

    /**
     * Carga lo necesario para resolver el impuesto de cada línea: tasas por producto (precios de catálogo con
     * impuesto incluido), tasa por defecto del restaurante y tributo propio de los combos.
     * @param {Array<{producto_id?:number, es_servicio?:any, combo_id?:number}>} lineas
     */
    static async cargarTasas(connection, tenantId, lineas) {
        const productoIds = lineas.filter(l => !l.es_servicio && l.producto_id).map(l => l.producto_id);
        const { tasas, defaultTasa } = await TaxService.getTasasPorProducto(tenantId, productoIds, connection);
        const infoCombos = await ComboVentaRepository.getInfoCombos(
            tenantId,
            [...new Set(lineas.filter(l => l.combo_id).map(l => l.combo_id))],
            connection
        );
        return { tasas, defaultTasa, infoCombos };
    }

    /**
     * Tasa y desglose (base gravable + impuesto) de una línea. Servicio y combo no tienen producto: el servicio usa
     * la tasa por defecto y el combo trae su propio tributo (NULL = el del restaurante).
     * @returns {{tasa:number, base_gravable:number, valor_impuesto:number}}
     */
    static desglosarLinea(linea, subtotal, { tasas, defaultTasa, infoCombos }) {
        const tasa = linea.es_servicio
            ? defaultTasa
            : linea.combo_id
              ? (infoCombos.get(linea.combo_id)?.tasa_impuesto ?? defaultTasa)
              : (tasas.get(linea.producto_id) ?? defaultTasa);
        const { base_gravable, valor_impuesto } = TaxService.desglosarLinea(subtotal, tasa);
        return { tasa, base_gravable, valor_impuesto };
    }
}

module.exports = NucleoFacturaRepository;
