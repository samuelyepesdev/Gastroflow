const db = require('../../../config/database');
const FacturaRepository = require('../../../repositories/Tenant/FacturaRepository');
const CajaRepository = require('../../../repositories/Tenant/CajaRepository');
const InventarioService = require('../InventarioService');
const TaxService = require('../../Shared/TaxService');

class FacturarPedidoService {
    /**
     * @description Carga un pedido, lo consolida, resta inventario y genera factura final.
     */
    static async execute({
        tenantId,
        pedidoId,
        cliente_id,
        forma_pago,
        descuentosMap,
        propinaBody,
        usuarioId = null,
        efectivoRecibido = null
    }) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            await FacturaRepository.acomodarNumeracionSiFalta(connection, tenantId);

            const { pedido, items } = await FacturarPedidoService._validarYObtenerPedidoConItems(
                connection,
                pedidoId,
                tenantId
            );

            const productoIds = items.filter(i => !i.es_servicio && i.producto_id).map(i => i.producto_id);
            const { tasas, defaultTasa } = await TaxService.getTasasPorProducto(tenantId, productoIds, connection);

            const serviciosExternosIds = await FacturarPedidoService._obtenerServiciosExternos(
                connection,
                tenantId,
                items
            );

            const {
                total,
                montoEfectivo: mEfectivoLineas,
                montoTransferencia: mTransfLineas,
                subtotalFactura,
                impuestosFactura,
                lineasFactura,
                montoServiciosExternos
            } = FacturarPedidoService._procesarLineasFactura(
                items,
                descuentosMap,
                tasas,
                defaultTasa,
                forma_pago,
                serviciosExternosIds
            );

            const propina = Math.max(
                0,
                Number.parseFloat(propinaBody !== null && propinaBody !== undefined ? propinaBody : pedido.propina) || 0
            );

            const { totalConPropina, montoEfectivo, montoTransferencia, formaPagoFinal } =
                FacturarPedidoService._calcularTotalesYFormaPago(
                    total,
                    mEfectivoLineas,
                    mTransfLineas,
                    propina,
                    forma_pago
                );

            const { numeroFactura, cajaSesionId, cajaSesionUsuarioId } =
                await FacturarPedidoService._obtenerNumeroYCajaSesion(connection, tenantId);
            const fechaEmisionUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');

            // Efectivo recibido: solo informativo (Recibido/Cambio). Se guarda si
            // hubo cobro en efectivo y el monto recibido cubre el total.
            const efectivoRecibidoNum = Number.parseFloat(efectivoRecibido) || 0;
            const efectivoRecibidoFinal =
                montoEfectivo > 0 && efectivoRecibidoNum >= totalConPropina ? efectivoRecibidoNum : null;

            const [facturaInsert] = await connection.query(
                `INSERT INTO facturas (tenant_id, numero, cliente_id, total, forma_pago, monto_efectivo, monto_transferencia, efectivo_recibido, propina, fecha, caja_sesion_id, subtotal, total_impuestos) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    tenantId,
                    numeroFactura,
                    cliente_id,
                    totalConPropina,
                    formaPagoFinal,
                    montoEfectivo,
                    montoTransferencia,
                    efectivoRecibidoFinal,
                    propina,
                    fechaEmisionUtc,
                    cajaSesionId,
                    Math.round(subtotalFactura * 100) / 100,
                    Math.round(impuestosFactura * 100) / 100
                ]
            );
            const facturaId = facturaInsert.insertId;

            const detallesValuesFinal = lineasFactura.map(l => [
                facturaId,
                l.producto_id,
                l.servicio_id,
                l.es_servicio,
                l.cantidad,
                l.precio_unitario,
                l.unidad_medida,
                l.subtotal,
                l.descuento_porcentaje,
                l.descuento_valor,
                l.base_gravable,
                l.tasa_impuesto,
                l.valor_impuesto
            ]);

            const [detalleResult] = await connection.query(
                `INSERT INTO detalle_factura (factura_id, producto_id, servicio_id, es_servicio, cantidad, precio_unitario, unidad_medida, subtotal, descuento_porcentaje, descuento_valor, base_gravable, tasa_impuesto, valor_impuesto) VALUES ?`,
                [detallesValuesFinal]
            );

            await FacturarPedidoService._copiarModificadores(connection, items, detalleResult.insertId);

            // El cobro de servicios externos (ej. domicilio de un tercero) entra con
            // la factura pero se le entrega al proveedor en efectivo: se compensa
            // con una salida de caja, sin importar cómo pagó el cliente la factura.
            if (cajaSesionId && montoServiciosExternos > 0) {
                await CajaRepository.registrarSalidaServicioExterno(
                    {
                        tenantId,
                        sesionId: cajaSesionId,
                        usuarioId: usuarioId || cajaSesionUsuarioId,
                        facturaId,
                        numeroFactura,
                        monto: montoServiciosExternos
                    },
                    connection
                );
            }

            await FacturarPedidoService._descontarInventario(tenantId, lineasFactura, facturaId);

            await connection.query(`UPDATE pedidos SET estado = 'cerrado', total = ? WHERE id = ?`, [
                totalConPropina,
                pedidoId
            ]);

            // Cancelar pedidos "hermanos" que quedaron vivos pero vacíos en esta
            // misma mesa (p. ej. doble "Abrir pedido" desde dos dispositivos). Si no,
            // quedan huérfanos: pedido 'abierto' + mesa 'libre', y al reabrir la mesa
            // el vigilante de refreshMesas los interpreta como "facturada por otro".
            await connection.query(
                `UPDATE pedidos p
                 SET p.estado = 'cancelado'
                 WHERE p.mesa_id = ?
                   AND p.id <> ?
                   AND p.estado NOT IN ('cerrado','cancelado')
                   AND NOT EXISTS (
                     SELECT 1 FROM pedido_items pi
                     WHERE pi.pedido_id = p.id AND pi.estado <> 'cancelado'
                   )`,
                [pedido.mesa_id, pedidoId]
            );

            // Liberar la mesa solo si ya no queda ningún pedido vivo (mismo criterio
            // que EliminarItemService / MoverItemsService).
            const [vivosRows] = await connection.query(
                `SELECT COUNT(*) AS vivos FROM pedidos
                 WHERE mesa_id = ? AND estado NOT IN ('cerrado','cancelado')`,
                [pedido.mesa_id]
            );
            if (Number(vivosRows[0]?.vivos || 0) === 0) {
                await connection.query(
                    `UPDATE mesas SET estado = 'libre', qr_session_id = NULL, last_qr_activity = NULL WHERE id = ?`,
                    [pedido.mesa_id]
                );
            }

            await connection.commit();

            await FacturarPedidoService._ejecutarEfectosSecundariosPostVenta({
                tenantId,
                pedidoId,
                mesaId: pedido.mesa_id,
                facturaId,
                totalConPropina,
                lineasFactura
            });

            return { factura_id: facturaId, numero: numeroFactura };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async _validarYObtenerPedidoConItems(connection, pedidoId, tenantId) {
        const [pedidos] = await connection.query('SELECT * FROM pedidos WHERE id = ? AND tenant_id = ? FOR UPDATE', [
            pedidoId,
            tenantId
        ]);
        if (pedidos.length === 0) {
            throw new Error('Pedido no encontrado');
        }
        const pedido = pedidos[0];

        if (pedido.estado === 'cerrado') {
            throw new Error('El pedido ya ha sido cerrado y facturado');
        }
        if (pedido.estado === 'cancelado') {
            throw new Error('El pedido ha sido cancelado');
        }

        const [items] = await connection.query(
            `SELECT * FROM pedido_items WHERE pedido_id = ? AND estado <> 'cancelado'`,
            [pedidoId]
        );
        if (items.length === 0) {
            throw new Error('Pedido sin items');
        }

        return { pedido, items };
    }

    /**
     * Normaliza una entrada de descuentosMap a { tipo, valor }.
     * Acepta un número suelto (retrocompat = porcentaje) o
     * { tipo: 'porcentaje'|'valor', valor: N }.
     */
    static _normalizarDescuento(entrada) {
        if (entrada === null || entrada === undefined) {
            return { tipo: 'porcentaje', valor: 0 };
        }
        if (typeof entrada === 'object') {
            const tipo = entrada.tipo === 'valor' ? 'valor' : 'porcentaje';
            return { tipo, valor: Math.max(0, Number(entrada.valor) || 0) };
        }
        return { tipo: 'porcentaje', valor: Math.max(0, Number(entrada) || 0) };
    }

    static _procesarLineasFactura(
        items,
        descuentosMap,
        tasas,
        defaultTasa,
        formaPagoBase,
        serviciosExternosIds = new Set()
    ) {
        let total = 0;
        let montoEfectivo = 0;
        let montoTransferencia = 0;
        let subtotalFactura = 0;
        let impuestosFactura = 0;
        // Servicios externos: se compensan SIEMPRE con una salida de caja en
        // efectivo (al domiciliario se le paga de la gaveta), sin importar cómo
        // pagó el cliente la factura.
        let montoServiciosExternos = 0;

        const lineasFactura = items.map(i => {
            const cant = Number(i.cantidad || 0);
            const precioUnit = Number(i.precio_unitario || 0);
            const bruto = cant * precioUnit;

            const { tipo: descTipo, valor: descValor } = FacturarPedidoService._normalizarDescuento(
                descuentosMap[String(i.id)]
            );

            let subtotal;
            let descuentoPorcentaje = null;
            let descuentoValor = null;
            if (descTipo === 'valor' && descValor > 0) {
                const montoDesc = Math.min(bruto, descValor);
                subtotal = Math.round((bruto - montoDesc) * 100) / 100;
                descuentoValor = Math.round(montoDesc * 100) / 100;
            } else {
                const desc = Math.min(100, Math.max(0, descValor)) / 100;
                subtotal = Math.round(bruto * (1 - desc) * 100) / 100;
                descuentoPorcentaje = desc > 0 ? descValor : null;
            }
            const precioUnitFactura =
                cant > 0 && subtotal !== bruto ? Math.round((subtotal / cant) * 100) / 100 : precioUnit;
            total += subtotal;

            const esPagadoEfectivo = i.pagado ? i.forma_pago === 'efectivo' : formaPagoBase === 'efectivo';
            const esPagadoTransf = i.pagado ? i.forma_pago === 'transferencia' : formaPagoBase === 'transferencia';

            if (esPagadoEfectivo) {
                montoEfectivo += subtotal;
            } else if (esPagadoTransf) {
                montoTransferencia += subtotal;
            }

            if (i.es_servicio && i.servicio_id && serviciosExternosIds.has(Number(i.servicio_id))) {
                montoServiciosExternos += subtotal;
            }

            const tasa = i.es_servicio ? defaultTasa : (tasas.get(i.producto_id) ?? defaultTasa);
            const { base_gravable, valor_impuesto } = TaxService.desglosarLinea(subtotal, tasa);
            subtotalFactura += base_gravable;
            impuestosFactura += valor_impuesto;

            return {
                producto_id: i.producto_id,
                servicio_id: i.servicio_id,
                es_servicio: i.es_servicio,
                cantidad: cant,
                precio_unitario: precioUnitFactura,
                unidad_medida: i.unidad_medida || 'UND',
                subtotal,
                descuento_porcentaje: descuentoPorcentaje,
                descuento_valor: descuentoValor,
                base_gravable,
                tasa_impuesto: tasa,
                valor_impuesto
            };
        });

        return {
            total,
            montoEfectivo,
            montoTransferencia,
            subtotalFactura,
            impuestosFactura,
            lineasFactura,
            montoServiciosExternos: Math.round(montoServiciosExternos * 100) / 100
        };
    }

    /** Set con los servicio_id de las líneas que son servicios externos (es_externo = 1). */
    static async _obtenerServiciosExternos(connection, tenantId, items) {
        const servicioIds = [
            ...new Set(items.filter(i => i.es_servicio && i.servicio_id).map(i => Number(i.servicio_id)))
        ];
        if (servicioIds.length === 0) {
            return new Set();
        }
        const [rows] = await connection.query(
            'SELECT id FROM servicios WHERE tenant_id = ? AND id IN (?) AND es_externo = 1',
            [tenantId, servicioIds]
        );
        return new Set(rows.map(r => Number(r.id)));
    }

    static _calcularTotalesYFormaPago(totalInicial, mEfectivoLineas, mTransfLineas, propina, formaPagoBase) {
        const total = Math.round(totalInicial * 100) / 100;
        const totalConPropina = Math.round((total + propina) * 100) / 100;

        let montoEfectivo = mEfectivoLineas;
        let montoTransferencia = mTransfLineas;

        if (formaPagoBase === 'efectivo') {
            montoEfectivo += propina;
        } else if (formaPagoBase === 'transferencia') {
            montoTransferencia += propina;
        }

        montoEfectivo = Math.round(montoEfectivo * 100) / 100;
        montoTransferencia = Math.round(montoTransferencia * 100) / 100;

        let formaPagoFinal = formaPagoBase;
        if (montoEfectivo > 0 && montoTransferencia > 0) {
            formaPagoFinal = 'mixto';
        } else if (montoEfectivo > 0) {
            formaPagoFinal = 'efectivo';
        } else if (montoTransferencia > 0) {
            formaPagoFinal = 'transferencia';
        }

        return { totalConPropina, montoEfectivo, montoTransferencia, formaPagoFinal };
    }

    static async _obtenerNumeroYCajaSesion(connection, tenantId) {
        const [rowsNum] = await connection.query(
            'SELECT COALESCE(MAX(numero), 0) + 1 AS siguiente FROM facturas WHERE tenant_id = ?',
            [tenantId]
        );
        const numeroFactura = rowsNum?.[0]?.siguiente || 1;

        const [sesiones] = await connection.query(
            'SELECT id, usuario_id FROM caja_sesiones WHERE tenant_id = ? AND estado = "abierta" LIMIT 1',
            [tenantId]
        );
        const cajaSesionId = sesiones.length > 0 ? sesiones[0].id : null;
        const cajaSesionUsuarioId = sesiones.length > 0 ? sesiones[0].usuario_id : null;

        return { numeroFactura, cajaSesionId, cajaSesionUsuarioId };
    }

    static async _copiarModificadores(connection, items, primerDetalleId) {
        const itemIds = items.map(i => i.id);
        const [modificadoresPedido] = await connection.query(
            'SELECT * FROM pedido_item_modificadores WHERE pedido_item_id IN (?)',
            [itemIds]
        );
        if (modificadoresPedido.length === 0) {
            return;
        }

        const modificadoresValuesFinal = [];
        items.forEach((item, i) => {
            modificadoresPedido
                .filter(m => m.pedido_item_id === item.id)
                .forEach(m => {
                    modificadoresValuesFinal.push([
                        primerDetalleId + i,
                        m.opcion_modificador_id,
                        m.grupo_nombre,
                        m.opcion_nombre,
                        m.precio_adicional,
                        m.cantidad
                    ]);
                });
        });
        await connection.query(
            'INSERT INTO detalle_factura_modificadores (detalle_factura_id, opcion_modificador_id, grupo_nombre, opcion_nombre, precio_adicional, cantidad) VALUES ?',
            [modificadoresValuesFinal]
        );
    }

    static async _descontarInventario(tenantId, lineasFactura, facturaId) {
        for (const l of lineasFactura) {
            try {
                if (!l.es_servicio && l.producto_id) {
                    await InventarioService.descontarPorReceta(
                        tenantId,
                        l.producto_id,
                        l.cantidad,
                        'factura_' + facturaId
                    );
                }
            } catch (invErr) {
                console.error('Error al descontar inventario por receta:', invErr);
            }
        }
    }

    static async _ejecutarEfectosSecundariosPostVenta({
        tenantId,
        pedidoId,
        mesaId,
        facturaId,
        totalConPropina,
        lineasFactura
    }) {
        try {
            const FacturacionElectronicaConfigService = require('../FacturacionElectronicaConfigService');
            await FacturacionElectronicaConfigService.encolarSiActivo(facturaId, tenantId);
        } catch (feErr) {
            console.error('Error opcional al encolar factura electrónica:', feErr);
        }

        try {
            const WhatsAppService = require('../WhatsAppService');
            WhatsAppService.events.emit('orderCreated', {
                tenantId,
                pedidoId,
                mesaId,
                action: 'billed'
            });
        } catch (err) {
            console.error('Error al emitir evento de facturación SSE:', err);
        }

        try {
            const FinanzasService = require('../FinanzasService');
            const ProductRepository = require('../../../repositories/Tenant/ProductRepository');

            const esCeramica = await FacturarPedidoService._verificarSiTieneCeramica(
                tenantId,
                lineasFactura,
                ProductRepository
            );

            await FinanzasService.registrarIngresoVenta(tenantId, {
                monto: totalConPropina,
                factura_id: facturaId,
                esCeramica,
                usuario_id: null
            });
        } catch (finErr) {
            console.error('CRÍTICO: Error al registrar ingreso en finanzas (pedido):', finErr);
        }

        try {
            const cacheService = require('../../Shared/CacheService');
            cacheService.deleteByPrefix(`tenant_dashboard_stats_${tenantId}`);
            cacheService.delete('superadmin_dashboard_stats');
        } catch (cacheErr) {
            console.error('Error opcional al invalidar caché de estadísticas:', cacheErr);
        }
    }

    static async _verificarSiTieneCeramica(tenantId, lineasFactura, ProductRepository) {
        for (const l of lineasFactura) {
            if (!l.es_servicio && l.producto_id) {
                try {
                    const prod = await ProductRepository.findById(l.producto_id, tenantId);
                    if (
                        prod &&
                        (prod.nombre?.toLowerCase().includes('cerámica') || prod.categoria_nombre === 'Cerámicas')
                    ) {
                        return true;
                    }
                } catch (lookupErr) {
                    console.error('Error al consultar producto para verificación de cerámica:', lookupErr);
                }
            }
        }
        return false;
    }
}

module.exports = FacturarPedidoService;
