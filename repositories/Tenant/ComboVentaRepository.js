/**
 * ComboVentaRepository - Snapshot de combos armables en las líneas vendidas
 * (pedido_item_combo_selecciones y detalle_factura_combo_selecciones).
 * Las líneas de combo van con producto_id NULL y combo_id, igual que las de servicio.
 * Related to: services/Tenant/ComboArmableService.js (resolverSeleccion produce el snapshot)
 */

const db = require('../../config/database');

const COLUMNAS = '(%FK%, combo_opcion_id, producto_id, grupo_nombre, producto_nombre, cantidad, recargo)';

const aFilas = (fk, selecciones) =>
    selecciones.map(s => [
        fk,
        s.combo_opcion_id,
        s.producto_id,
        s.grupo_nombre,
        s.producto_nombre,
        s.cantidad,
        s.recargo
    ]);

class ComboVentaRepository {
    /** Guarda el snapshot de una línea de pedido. `executor` = connection de la transacción o db. */
    static async guardarSeleccionesPedidoItem(pedidoItemId, selecciones, executor = db) {
        if (!selecciones || selecciones.length === 0) {
            return;
        }
        await executor.query(
            `INSERT INTO pedido_item_combo_selecciones ${COLUMNAS.replace('%FK%', 'pedido_item_id')} VALUES ?`,
            [aFilas(pedidoItemId, selecciones)]
        );
    }

    /** Selecciones de varias líneas de pedido, agrupadas: Map(pedido_item_id -> selecciones[]). */
    static async getSeleccionesPorItems(itemIds, executor = db) {
        const porItem = new Map();
        if (!itemIds || itemIds.length === 0) {
            return porItem;
        }
        const [rows] = await executor.query(
            `SELECT pedido_item_id, combo_opcion_id, producto_id, grupo_nombre, producto_nombre, cantidad, recargo
             FROM pedido_item_combo_selecciones
             WHERE pedido_item_id IN (?)
             ORDER BY id`,
            [itemIds]
        );
        for (const r of rows) {
            if (!porItem.has(r.pedido_item_id)) {
                porItem.set(r.pedido_item_id, []);
            }
            porItem.get(r.pedido_item_id).push(r);
        }
        return porItem;
    }

    /**
     * Copia el snapshot de las líneas de pedido a las de factura. `items` y los detalles se
     * insertaron en el mismo orden y en un solo INSERT, así que el detalle de la posición i
     * tiene id `primerDetalleId + i` (mismo criterio que _copiarModificadores).
     */
    static async copiarAFactura(connection, items, primerDetalleId) {
        const porItem = await this.getSeleccionesPorItems(
            items.filter(i => i.combo_id).map(i => i.id),
            connection
        );
        const filas = [];
        items.forEach((item, i) => {
            filas.push(...aFilas(primerDetalleId + i, porItem.get(item.id) || []));
        });
        if (filas.length === 0) {
            return;
        }
        await connection.query(
            `INSERT INTO detalle_factura_combo_selecciones ${COLUMNAS.replace('%FK%', 'detalle_factura_id')} VALUES ?`,
            [filas]
        );
    }

    /** Guarda el snapshot de una línea de factura creada directamente (POS sin pedido previo). */
    static async guardarSeleccionesDetalle(detalleFacturaId, selecciones, executor = db) {
        if (!selecciones || selecciones.length === 0) {
            return;
        }
        await executor.query(
            `INSERT INTO detalle_factura_combo_selecciones ${COLUMNAS.replace('%FK%', 'detalle_factura_id')} VALUES ?`,
            [aFilas(detalleFacturaId, selecciones)]
        );
    }

    /** Selecciones vendidas en una factura, con la cantidad del combo vendido (para descontar inventario). */
    static async getSeleccionesPorFactura(facturaId, executor = db) {
        const [rows] = await executor.query(
            `SELECT s.producto_id, s.cantidad AS cantidad_por_combo, d.cantidad AS cantidad_combo
             FROM detalle_factura_combo_selecciones s
             JOIN detalle_factura d ON d.id = s.detalle_factura_id
             WHERE d.factura_id = ? AND s.producto_id IS NOT NULL`,
            [facturaId]
        );
        return rows;
    }

    /** Impuesto y nombre vigentes de los combos: Map(combo_id -> { nombre, tasa_impuesto }). */
    static async getInfoCombos(tenantId, comboIds, executor = db) {
        const info = new Map();
        if (!comboIds || comboIds.length === 0) {
            return info;
        }
        const [rows] = await executor.query(
            'SELECT id, nombre, tributo, tasa_impuesto FROM combos WHERE tenant_id = ? AND id IN (?)',
            [tenantId, comboIds]
        );
        for (const r of rows) {
            info.set(r.id, {
                nombre: r.nombre,
                tasa_impuesto: r.tasa_impuesto === null ? null : Number(r.tasa_impuesto)
            });
        }
        return info;
    }
}

module.exports = ComboVentaRepository;
