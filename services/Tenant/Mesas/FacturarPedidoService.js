const db = require('../../../config/database');
const FacturaRepository = require('../../../repositories/Tenant/FacturaRepository');
const InventarioService = require('../InventarioService');

class FacturarPedidoService {
    /**
     * @description Carga un pedido, lo consolida, resta inventario y genera factura final.
     */
    static async execute({ tenantId, pedidoId, cliente_id, forma_pago, descuentosMap, propinaBody }) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            await FacturaRepository.acomodarNumeracionSiFalta(connection, tenantId);

            const [pedidos] = await connection.query('SELECT * FROM pedidos WHERE id = ? AND tenant_id = ? FOR UPDATE', [pedidoId, tenantId]);
            if (pedidos.length === 0) throw new Error('Pedido no encontrado');
            const pedido = pedidos[0];

            const [items] = await connection.query(
                `SELECT * FROM pedido_items WHERE pedido_id = ? AND estado <> 'cancelado'`,
                [pedidoId]
            );
            if (items.length === 0) throw new Error('Pedido sin items');

            let total = 0;
            let montoEfectivo = 0;
            let montoTransferencia = 0;

            const lineasFactura = items.map(i => {
                const cant = Number(i.cantidad || 0);
                const precioUnit = Number(i.precio_unitario || 0);
                const pct = descuentosMap[String(i.id)] != null ? Number(descuentosMap[String(i.id)]) : 0;
                const desc = Math.min(100, Math.max(0, pct)) / 100;
                const subtotal = Math.round(cant * precioUnit * (1 - desc) * 100) / 100;
                const precioUnitFactura = desc > 0 ? Math.round(precioUnit * (1 - desc) * 100) / 100 : precioUnit;
                total += subtotal;

                if (i.pagado) {
                    if (i.forma_pago === 'efectivo') montoEfectivo += subtotal;
                    else if (i.forma_pago === 'transferencia') montoTransferencia += subtotal;
                } else {
                    if (forma_pago === 'efectivo') montoEfectivo += subtotal;
                    else if (forma_pago === 'transferencia') montoTransferencia += subtotal;
                }

                return { 
                    producto_id: i.producto_id, 
                    servicio_id: i.servicio_id,
                    es_servicio: i.es_servicio,
                    cantidad: cant, 
                    precio_unitario: precioUnitFactura, 
                    unidad_medida: i.unidad_medida || 'UND', 
                    subtotal, 
                    descuento_porcentaje: desc > 0 ? pct : null 
                };
            });
            total = Math.round(total * 100) / 100;
            const propina = Math.max(0, parseFloat(propinaBody != null ? propinaBody : pedido.propina) || 0);
            const totalConPropina = Math.round((total + propina) * 100) / 100;

            if (forma_pago === 'efectivo') montoEfectivo += propina;
            else if (forma_pago === 'transferencia') montoTransferencia += propina;

            montoEfectivo = Math.round(montoEfectivo * 100) / 100;
            montoTransferencia = Math.round(montoTransferencia * 100) / 100;

            let formaPagoFinal = forma_pago;
            if (montoEfectivo > 0 && montoTransferencia > 0) formaPagoFinal = 'mixto';
            else if (montoEfectivo > 0) formaPagoFinal = 'efectivo';
            else if (montoTransferencia > 0) formaPagoFinal = 'transferencia';

            const [rowsNum] = await connection.query(
                'SELECT COALESCE(MAX(numero), 0) + 1 AS siguiente FROM facturas WHERE tenant_id = ?',
                [tenantId]
            );
            const numeroFactura = (rowsNum && rowsNum[0] && rowsNum[0].siguiente) || 1;
            const fechaEmisionUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');

            const [sesiones] = await connection.query(
                'SELECT id FROM caja_sesiones WHERE tenant_id = ? AND estado = "abierta" LIMIT 1',
                [tenantId]
            );
            const cajaSesionId = sesiones.length > 0 ? sesiones[0].id : null;

            const [facturaInsert] = await connection.query(
                `INSERT INTO facturas (tenant_id, numero, cliente_id, total, forma_pago, monto_efectivo, monto_transferencia, propina, fecha, caja_sesion_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [tenantId, numeroFactura, cliente_id, totalConPropina, formaPagoFinal, montoEfectivo, montoTransferencia, propina, fechaEmisionUtc, cajaSesionId]
            );
            const facturaId = facturaInsert.insertId;

            const detallesValuesFinal = lineasFactura.map(l => [
                facturaId, l.producto_id, l.servicio_id, l.es_servicio, l.cantidad, 
                l.precio_unitario, l.unidad_medida, l.subtotal, l.descuento_porcentaje
            ]);

            await connection.query(
                `INSERT INTO detalle_factura (factura_id, producto_id, servicio_id, es_servicio, cantidad, precio_unitario, unidad_medida, subtotal, descuento_porcentaje) VALUES ?`,
                [detallesValuesFinal]
            );

            for (const l of lineasFactura) {
                try {
                    if (!l.es_servicio && l.producto_id) {
                        await InventarioService.descontarPorReceta(tenantId, l.producto_id, l.cantidad, 'factura_' + facturaId);
                    }
                } catch (invErr) {
                    console.error('Error al descontar inventario por receta:', invErr);
                }
            }

            await connection.query(`UPDATE pedidos SET estado = 'cerrado', total = ? WHERE id = ?`, [totalConPropina, pedidoId]);
            await connection.query(`UPDATE mesas SET estado = 'libre', qr_session_id = NULL, last_qr_activity = NULL WHERE id = ?`, [pedido.mesa_id]);

            await connection.commit();

            // --- INTEGRACIÓN CON FINANZAS ---
            // Se ejecuta DESPUÉS del commit para no bloquear la transacción principal.
            try {
                const FinanzasService = require('../FinanzasService');
                const ProductRepository = require('../../../repositories/Tenant/ProductRepository');

                // Detectar si algún item de la venta es una cerámica
                let esCeramica = false;
                for (const l of lineasFactura) {
                    if (!l.es_servicio && l.producto_id) {
                        try {
                            const prod = await ProductRepository.findById(l.producto_id, tenantId);
                            if (prod && (prod.nombre?.toLowerCase().includes('cerámica') || prod.categoria_nombre === 'Cerámicas')) {
                                esCeramica = true;
                                break;
                            }
                        } catch (_) { /* ignorar error de lookup */ }
                    }
                }

                await FinanzasService.registrarIngresoVenta(tenantId, {
                    monto: totalConPropina,
                    factura_id: facturaId,
                    esCeramica,
                    usuario_id: null // La sesión de caja ya provee el usuario en FinanzasService
                });
            } catch (finErr) {
                console.error('CRÍTICO: Error al registrar ingreso en finanzas (pedido):', finErr);
            }
            // --------------------------------
            
            // --- INVALIDAR CACHÉ DE ESTADÍSTICAS (Actualización instantánea del Dashboard) ---
            try {
                const cacheService = require('../../Shared/CacheService');
                cacheService.deleteByPrefix(`tenant_dashboard_stats_${tenantId}`);
                cacheService.delete('superadmin_dashboard_stats');
            } catch (cacheErr) {
                console.error('Error opcional al invalidar caché de estadísticas:', cacheErr);
            }

            return { factura_id: facturaId, numero: numeroFactura };
            
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }
}

module.exports = FacturarPedidoService;
