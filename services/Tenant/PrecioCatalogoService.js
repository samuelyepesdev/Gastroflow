/**
 * PrecioCatalogoService - Control de descuentos no autorizados en una venta.
 *
 * El cliente (POS / facturación) manda precio, subtotal y total de cada línea. El único descuento que
 * puede aplicarse sin permiso es el de una promoción vigente, que el servidor calcula igual que el
 * cliente (PromocionService). Cualquier valor por debajo de "catálogo - promoción" es un descuento
 * manual y exige el permiso ventas.aplicar_descuento.
 */
const db = require('../../config/database');
const PromocionService = require('./PromocionService');

const TOLERANCIA_LINEA = 0.5; // redondeos de pesos
const TOLERANCIA_TOTAL = 1;

function errorSinPermiso() {
    return Object.assign(new Error('No tienes permiso para aplicar descuentos o cambiar precios'), {
        status: 403,
        codigo: 'DESCUENTO_NO_AUTORIZADO'
    });
}

class PrecioCatalogoService {
    /**
     * Lanza 403 si el usuario no tiene permiso de descuento y la venta cobra menos de lo que
     * corresponde por catálogo y promociones vigentes.
     * @param {number} tenantId
     * @param {Array} productos - líneas ya resueltas (combos con precio de servidor, modificadores sumados)
     * @param {number} total - total que declara el cliente
     * @param {boolean} puedeAplicarDescuento
     */
    static async exigirSinDescuentoNoAutorizado(tenantId, productos, total, puedeAplicarDescuento) {
        if (puedeAplicarDescuento) {
            return;
        }

        const lineasProducto = productos.filter(p => !p.es_servicio && !p.combo_id && p.producto_id);
        const lineasServicio = productos.filter(p => p.es_servicio && p.servicio_id);

        const productoIds = [...new Set(lineasProducto.map(p => p.producto_id))];
        const servicioIds = [...new Set(lineasServicio.map(p => p.servicio_id))];

        const catalogo = new Map();
        if (productoIds.length > 0) {
            const [rows] = await db.query(
                'SELECT id, precio_unidad, categoria_id FROM productos WHERE tenant_id = ? AND id IN (?)',
                [tenantId, productoIds]
            );
            rows.forEach(r => catalogo.set(r.id, r));
        }
        const preciosServicio = new Map();
        if (servicioIds.length > 0) {
            const [rows] = await db.query('SELECT id, precio FROM servicios WHERE tenant_id = ? AND id IN (?)', [
                tenantId,
                servicioIds
            ]);
            rows.forEach(r => preciosServicio.set(r.id, Number(r.precio) || 0));
        }

        // La promoción "por cantidad" cuenta la cantidad TOTAL del producto entre todas sus líneas.
        const cantidadPorProducto = new Map();
        lineasProducto.forEach(p => {
            cantidadPorProducto.set(p.producto_id, (cantidadPorProducto.get(p.producto_id) || 0) + Number(p.cantidad));
        });
        const promos = await PromocionService.getDescuentoPorProductos(
            tenantId,
            productoIds
                .filter(id => catalogo.has(id))
                .map(id => ({
                    producto_id: id,
                    categoria_id: catalogo.get(id).categoria_id,
                    cantidad: cantidadPorProducto.get(id)
                }))
        );

        let totalMinimo = 0;
        for (const p of productos) {
            const cantidad = Number(p.cantidad);
            let minimoLinea;
            if (p.combo_id) {
                // El combo ya se resolvió en el servidor: precio_original es su precio de lista.
                minimoLinea = cantidad * (Number(p.precio_original) || 0);
            } else if (p.es_servicio) {
                minimoLinea = cantidad * (preciosServicio.get(p.servicio_id) ?? 0);
            } else {
                const prod = catalogo.get(p.producto_id);
                if (!prod) {
                    continue;
                }
                const base = Number(prod.precio_unidad) || 0;
                const promo = promos.get(p.producto_id);
                const unitario = promo ? Math.max(0, base - PromocionService.calcularDescuento(promo, base)) : base;
                minimoLinea = cantidad * (unitario + (Number(p._precioAdicional) || 0));
            }
            if (Number(p.subtotal) < minimoLinea - TOLERANCIA_LINEA) {
                throw errorSinPermiso();
            }
            totalMinimo += minimoLinea;
        }

        if (Number(total) < totalMinimo - TOLERANCIA_TOTAL) {
            throw errorSinPermiso();
        }
    }
}

module.exports = PrecioCatalogoService;
