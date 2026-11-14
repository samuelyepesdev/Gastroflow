/**
 * OrdenCompraService - Órdenes de compra a proveedor: crear, listar, recibir.
 * Recibir es el punto de enganche con inventario: por cada línea con cantidad
 * recibida > 0 se llama a InventarioService.registrarEntrada (ya soporta
 * proveedor_id/documento_referencia), así que el stock y el costo promedio
 * quedan igual que si se hubiera registrado la entrada a mano.
 */

const db = require('../../config/database');
const OrdenCompraRepository = require('../../repositories/Tenant/OrdenCompraRepository');
const ProveedorRepository = require('../../repositories/Tenant/ProveedorRepository');
const InsumoRepository = require('../../repositories/Tenant/InsumoRepository');
const InventarioService = require('./InventarioService');

class OrdenCompraService {
    static async listar(tenantId, filtros) {
        return OrdenCompraRepository.findAll(tenantId, filtros);
    }

    static async getDetalle(id, tenantId) {
        const orden = await OrdenCompraRepository.findById(id, tenantId);
        if (!orden) {
            throw new Error('Orden de compra no encontrada');
        }
        return orden;
    }

    static async crear(tenantId, data) {
        const { proveedor_id, notas, items } = data;
        if (!proveedor_id) {
            throw new Error('El proveedor es requerido');
        }
        if (!Array.isArray(items) || items.length === 0) {
            throw new Error('La orden debe tener al menos un insumo');
        }

        const proveedor = await ProveedorRepository.findById(proveedor_id, tenantId);
        if (!proveedor) {
            throw new Error('Proveedor no encontrado');
        }

        const itemsLimpios = [];
        for (const item of items) {
            const cantidad = Number.parseFloat(item.cantidad_pedida);
            if (!item.insumo_id || !(cantidad > 0)) {
                throw new Error('Cada línea necesita un insumo y una cantidad mayor a 0');
            }
            const insumo = await InsumoRepository.findById(item.insumo_id, tenantId);
            if (!insumo) {
                throw new Error(`Insumo ${item.insumo_id} no encontrado`);
            }
            const costoEstimado =
                item.costo_unitario_estimado !== undefined &&
                item.costo_unitario_estimado !== null &&
                item.costo_unitario_estimado !== ''
                    ? Number.parseFloat(item.costo_unitario_estimado)
                    : null;
            itemsLimpios.push({
                insumo_id: item.insumo_id,
                cantidad_pedida: cantidad,
                costo_unitario_estimado: costoEstimado
            });
        }

        const id = await OrdenCompraRepository.create(tenantId, { proveedor_id, notas, items: itemsLimpios });
        return { id, message: 'Orden de compra creada correctamente' };
    }

    /**
     * @param {Array<{id:number, cantidad_recibida:number}>} itemsRecibidos Cantidad real por línea (puede diferir de lo pedido).
     */
    static async recibir(id, tenantId, itemsRecibidos) {
        if (!Array.isArray(itemsRecibidos) || itemsRecibidos.length === 0) {
            throw new Error('Debes indicar la cantidad recibida de al menos una línea');
        }

        // UNA transacción para toda la recepción: la orden se bloquea primero (un doble clic espera y luego la ve
        // ya recibida), cada entrada de inventario y su egreso de caja se escriben en ella, y la orden pasa a
        // 'recibida' antes del commit. Si una línea falla, no queda ninguna entrada ni egreso a medias.
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const bloqueada = await OrdenCompraRepository.bloquear(id, tenantId, conn);
            if (!bloqueada) {
                throw new Error('Orden de compra no encontrada');
            }
            if (bloqueada.estado !== 'pendiente') {
                throw new Error(`La orden ya está ${bloqueada.estado}, no se puede recibir`);
            }
            const orden = await OrdenCompraRepository.findById(id, tenantId, conn);

            const itemsPorId = new Map(orden.items.map(i => [i.id, i]));
            const normalizados = itemsRecibidos.map(r => {
                const item = itemsPorId.get(Number(r.id));
                if (!item) {
                    throw new Error(`La línea ${r.id} no pertenece a esta orden`);
                }
                const cantidad = Number.parseFloat(r.cantidad_recibida);
                if (Number.isNaN(cantidad) || cantidad < 0) {
                    throw new Error(`Cantidad recibida inválida para ${item.insumo_nombre}`);
                }
                return { item, cantidad };
            });

            for (const { item, cantidad } of normalizados) {
                if (cantidad <= 0) {
                    continue;
                }
                await InventarioService.registrarEntrada(
                    tenantId,
                    {
                        insumo_id: item.insumo_id,
                        cantidad,
                        costo_unitario: item.costo_unitario_estimado,
                        proveedor_id: orden.proveedor_id,
                        documento_referencia: `OC-${id}`
                    },
                    conn
                );
            }

            await OrdenCompraRepository.marcarRecibida(
                id,
                tenantId,
                normalizados.map(({ item, cantidad }) => ({ id: item.id, cantidad_recibida: cantidad })),
                conn
            );

            await conn.commit();
        } catch (error) {
            await conn.rollback();
            throw error;
        } finally {
            conn.release();
        }

        return { message: 'Orden recibida: el inventario ya quedó actualizado' };
    }

    static async cancelar(id, tenantId) {
        const affectedRows = await OrdenCompraRepository.cancelar(id, tenantId);
        if (affectedRows === 0) {
            throw new Error('La orden no existe o ya fue recibida/cancelada');
        }
        return { message: 'Orden de compra cancelada' };
    }
}

module.exports = OrdenCompraService;
