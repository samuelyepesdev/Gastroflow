/**
 * PostVentaService - Efectos de una venta compartidos por los dos motores de facturación
 * (FacturaService/FacturaRepository para POS y facturación directa, FacturarPedidoService para Mesas).
 *
 * Dos momentos, con reglas distintas (ver CLAUDE.md, "Efectos de una venta = misma transacción"):
 *  1. registrarEfectosEnTransaccion: dinero e inventario. Corre DENTRO de la transacción de la factura y escribe
 *     SOLO con `connection`; un error revierte la venta completa.
 *  2. ejecutarEfectosPostCommit: factura electrónica, sello de fidelización y caché. Va DESPUÉS del commit y es
 *     best-effort: la venta ya está registrada y nunca se tumba por esto.
 */
const FinanzasService = require('../FinanzasService');
const InventarioService = require('../InventarioService');
const FidelizacionService = require('../FidelizacionService');
const InsumoRepository = require('../../../repositories/Tenant/InsumoRepository');
const ProductRepository = require('../../../repositories/Tenant/ProductRepository');
const cacheService = require('../../Shared/CacheService');
const { esIdInsumoVirtual, insumoIdDeVirtual } = require('../../../utils/insumoVirtual');

const esCeramicaPorNombre = nombre => Boolean(nombre && String(nombre).toLowerCase().includes('cerámica'));
const esCeramicaPorRegistro = r => Boolean(r && (esCeramicaPorNombre(r.nombre) || r.categoria_nombre === 'Cerámicas'));

class PostVentaService {
    /**
     * ¿Alguna línea es cerámica? Solo lecturas: 2 consultas en lote (antes, en Mesas, 1 por línea).
     * Si la detección falla se asume que no (el ingreso se registra igual).
     * @param {Array<{producto_id?:number, nombre?:string, es_servicio?:boolean}>} lineas
     */
    static async detectarCeramica(tenantId, lineas, conn = null) {
        try {
            const reales = lineas.filter(l => l.producto_id && !esIdInsumoVirtual(l.producto_id));
            const virtuales = lineas.filter(l => l.producto_id && esIdInsumoVirtual(l.producto_id));
            // Una conexión de transacción ejecuta una consulta a la vez: en secuencia, no en paralelo.
            const insumosPorId = await InsumoRepository.findByIds(
                virtuales.map(l => insumoIdDeVirtual(l.producto_id)),
                tenantId,
                conn
            );
            const productosPorId = await ProductRepository.findByIds(
                reales.filter(l => !l.es_servicio).map(l => l.producto_id),
                tenantId,
                conn
            );
            return lineas.some(l => {
                if (esCeramicaPorNombre(l.nombre)) {
                    return true;
                }
                if (l.producto_id && esIdInsumoVirtual(l.producto_id)) {
                    return esCeramicaPorRegistro(insumosPorId.get(insumoIdDeVirtual(l.producto_id)));
                }
                if (l.producto_id && !l.es_servicio) {
                    return esCeramicaPorRegistro(productosPorId.get(l.producto_id));
                }
                return false;
            });
        } catch (error) {
            console.error('Error opcional en detección de cerámicas:', error);
            return false;
        }
    }

    /**
     * Ingreso en finanzas + descuento de inventario (recetas, combos armados y toppings), atómicos con la
     * factura. `connection` es la de la transacción de la venta: los detalles recién insertados solo son
     * visibles desde ella y la fila del tenant la tiene bloqueada (NumeracionRepository).
     * @param {Object} connection
     * @param {{tenantId:number, facturaId:number, lineas:Array, total:number, usuarioId?:number|null, fecha?:string|null}} datos
     *   `fecha` ('YYYY-MM-DD') solo para ventas de evento de otro día.
     */
    static async registrarEfectosEnTransaccion(connection, { tenantId, facturaId, lineas, total, usuarioId, fecha }) {
        const esCeramica = await PostVentaService.detectarCeramica(tenantId, lineas, connection);

        await FinanzasService.registrarIngresoVenta(tenantId, {
            monto: total,
            factura_id: facturaId,
            esCeramica,
            usuario_id: usuarioId || null,
            fecha: fecha || undefined,
            conn: connection
        });

        // Combos armados primero (como siempre), luego recetas de todas las líneas sumadas por insumo, y toppings
        if (lineas.some(l => l.combo_id)) {
            await InventarioService.descontarPorCombosFactura(tenantId, facturaId, connection);
        }
        await InventarioService.descontarProductosLote(
            tenantId,
            lineas
                .filter(l => !l.es_servicio && l.producto_id)
                .map(l => ({ producto_id: l.producto_id, cantidad: parseFloat(l.cantidad) || 1 })),
            'factura_' + facturaId,
            connection
        );
        await InventarioService.descontarPorModificadoresFactura(tenantId, facturaId, connection);
    }

    /**
     * Efectos tras el commit. Nunca lanza.
     * @param {{tenantId:number, facturaId:number, clienteId:number, total:number, usuarioId?:number|null}} datos
     */
    static async ejecutarEfectosPostCommit({ tenantId, facturaId, clienteId, total, usuarioId }) {
        try {
            const FacturacionElectronicaConfigService = require('../FacturacionElectronicaConfigService');
            await FacturacionElectronicaConfigService.encolarSiActivo(facturaId, tenantId);
        } catch (feErr) {
            console.error('Error opcional al encolar factura electrónica:', feErr);
        }

        // Sello de fidelización: idempotente por factura y solo aplica si el cliente tiene tarjeta (no lanza).
        await FidelizacionService.sellarPorFactura({
            tenantId,
            facturaId,
            clienteId,
            total,
            usuarioId: usuarioId || null
        });

        try {
            cacheService.deleteByPrefix(`tenant_dashboard_stats_${tenantId}`);
            cacheService.delete('superadmin_dashboard_stats');
        } catch (cacheErr) {
            console.error('Error opcional al invalidar caché de estadísticas:', cacheErr);
        }
    }
}

module.exports = PostVentaService;
