/**
 * InventarioService - Movimientos, stock y valorización (promedio ponderado).
 * Recetas usan insumos; al facturar se generan salidas.
 */

const db = require('../../config/database');
const InsumoRepository = require('../../repositories/Tenant/InsumoRepository');
const MovimientoInventarioRepository = require('../../repositories/Tenant/MovimientoInventarioRepository');
const RecetaRepository = require('../../repositories/Tenant/RecetaRepository');
const { convertirABase } = require('../../utils/unidadesCosteo');

// Conversión a unidad base para comparar con stock (stock está en unidad_base).
// Antes esta tabla vivía duplicada aquí y en CosteoService, y esta copia no soportaba 'lb'.
function cantidadABase(cantidad, unidad) {
    return convertirABase(cantidad, unidad || 'g').cantidadBase;
}

function calcularCostoEntrada(costoUnitario, insumo) {
    if (costoUnitario !== null && costoUnitario !== undefined) {
        return Number.parseFloat(costoUnitario);
    }
    if (insumo.costo_promedio !== null && insumo.costo_promedio !== undefined) {
        return Number.parseFloat(insumo.costo_promedio);
    }
    if (insumo.precio_compra && insumo.cantidad_compra) {
        return insumo.precio_compra / insumo.cantidad_compra;
    }
    return null;
}

function calcularNuevoCostoPromedio(cant, costo, stockActual, costoActual, nuevoStock) {
    const tieneCosto = costo !== null && costo !== undefined;
    const tieneStockOCostoActual = stockActual > 0 || (costoActual !== null && costoActual !== undefined);

    if (tieneCosto && tieneStockOCostoActual) {
        return (stockActual * (costoActual || costo) + cant * costo) / nuevoStock;
    }
    return costo;
}

async function registrarGastoFinanzasSiAplica(tenantId, insumo, insumoId, cant, costo) {
    if (!costo || costo <= 0 || cant <= 0) {
        return;
    }

    const FinanzasService = require('./FinanzasService');
    try {
        await FinanzasService.registrarGastoInventario(tenantId, {
            monto: costo * cant,
            insumo_nombre: insumo.nombre,
            mov_id: insumoId,
            categoria_nombre: insumo.categoria_nombre
        });
    } catch (finErr) {
        console.error('Error al registrar gasto en finanzas:', finErr);
    }
}

class InventarioService {
    static async listInsumos(tenantId, filters = {}) {
        const rows = await InsumoRepository.findAll(tenantId, filters);
        return (rows || []).map(r => ({
            ...r,
            stock_actual: Number.parseFloat(r.stock_actual) || 0,
            stock_minimo: Number.parseFloat(r.stock_minimo) || 0,
            costo_promedio:
                r.costo_promedio !== null && r.costo_promedio !== undefined
                    ? Number.parseFloat(r.costo_promedio)
                    : null,
            unidad_base: r.unidad_base || 'g'
        }));
    }

    static async getInsumo(id, tenantId) {
        return InsumoRepository.findById(id, tenantId);
    }

    /**
     * Registrar entrada: aumenta stock y actualiza costo promedio (promedio ponderado).
     */
    static async registrarEntrada(
        tenantId,
        { insumo_id, cantidad, costo_unitario, referencia, proveedor_id, documento_referencia }
    ) {
        const insumo = await InsumoRepository.findById(insumo_id, tenantId);
        if (!insumo) {
            throw new Error('Insumo no encontrado');
        }
        const cant = Number.parseFloat(cantidad);
        if (cant <= 0) {
            throw new Error('La cantidad debe ser mayor a 0');
        }

        const costo = calcularCostoEntrada(costo_unitario, insumo);
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            await conn.query(
                `INSERT INTO movimientos_inventario (tenant_id, insumo_id, proveedor_id, tipo, cantidad, costo_unitario, referencia, documento_referencia) VALUES (?, ?, ?, 'entrada', ?, ?, ?, ?)`,
                [
                    tenantId,
                    insumo_id,
                    proveedor_id || null,
                    cant,
                    costo,
                    referencia || null,
                    documento_referencia || null
                ]
            );

            const stockActual = Number.parseFloat(insumo.stock_actual) || 0;
            const costoActual =
                insumo.costo_promedio !== null && insumo.costo_promedio !== undefined
                    ? Number.parseFloat(insumo.costo_promedio)
                    : null;
            const nuevoStock = stockActual + cant;
            const nuevoCosto = calcularNuevoCostoPromedio(cant, costo, stockActual, costoActual, nuevoStock);

            const stockValorizadoActual = Number.parseFloat(insumo.stock_valorizado) || 0;
            const nuevoStockValorizado = stockValorizadoActual + cant;

            await conn.query(
                'UPDATE insumos SET stock_actual = ?, stock_valorizado = ?, costo_promedio = ? WHERE id = ? AND tenant_id = ?',
                [nuevoStock, nuevoStockValorizado, nuevoCosto, insumo_id, tenantId]
            );

            // --- INTEGRACIÓN CON FINANZAS ---
            await registrarGastoFinanzasSiAplica(tenantId, insumo, insumo_id, cant, costo);
            // --------------------------------

            await conn.commit();
            return { nuevoStock, nuevoCosto };
        } catch (e) {
            await conn.rollback();
            throw e;
        } finally {
            conn.release();
        }
    }

    /**
     * Registrar salida: disminuye stock. No modifica costo_promedio.
     */
    static async registrarSalida(tenantId, { insumo_id, cantidad, referencia }) {
        const insumo = await InsumoRepository.findById(insumo_id, tenantId);
        if (!insumo) {
            throw new Error('Insumo no encontrado');
        }
        const cant = Number.parseFloat(cantidad);
        if (cant <= 0) {
            throw new Error('La cantidad debe ser mayor a 0');
        }
        const stockActual = Number.parseFloat(insumo.stock_actual) || 0;
        if (stockActual < cant) {
            console.warn(
                `[Inventario] Stock insuficiente para ${insumo.nombre}. Disponible: ${stockActual}, Requerido: ${cant}. Se permitirá stock negativo.`
            );
        }
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            await conn.query(
                `INSERT INTO movimientos_inventario (tenant_id, insumo_id, tipo, cantidad, costo_unitario, referencia) VALUES (?, ?, 'salida', ?, ?, ?)`,
                [tenantId, insumo_id, cant, insumo.costo_promedio, referencia || null]
            );
            const nuevoStock = stockActual - cant;
            const stockValorizadoActual = Number.parseFloat(insumo.stock_valorizado) || 0;
            const nuevoStockValorizado = stockValorizadoActual - cant;
            await conn.query(
                'UPDATE insumos SET stock_actual = ?, stock_valorizado = ? WHERE id = ? AND tenant_id = ?',
                [nuevoStock, nuevoStockValorizado, insumo_id, tenantId]
            );
            await conn.commit();
            return { nuevoStock };
        } catch (e) {
            await conn.rollback();
            throw e;
        } finally {
            conn.release();
        }
    }

    /**
     * Ajuste manual: suma o resta directa al stock (cantidad puede ser negativa).
     * No toca stock_valorizado ni costo_promedio a propósito: el ajuste corrige el
     * conteo físico (mermas, errores de cocina) sin mover el "Valor de inventario"
     * reportado — para eso ya existen el registro de compra y el registro de gasto.
     */
    static async registrarAjuste(tenantId, { insumo_id, cantidad, referencia }) {
        const insumo = await InsumoRepository.findById(insumo_id, tenantId);
        if (!insumo) {
            throw new Error('Insumo no encontrado');
        }
        const cant = Number.parseFloat(cantidad);
        const stockActual = Number.parseFloat(insumo.stock_actual) || 0;
        const nuevoStock = Math.max(0, stockActual + cant);
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            await conn.query(
                `INSERT INTO movimientos_inventario (tenant_id, insumo_id, tipo, cantidad, costo_unitario, referencia) VALUES (?, ?, 'ajuste', ?, NULL, ?)`,
                [tenantId, insumo_id, cant, referencia || 'Ajuste manual']
            );
            await conn.query('UPDATE insumos SET stock_actual = ? WHERE id = ? AND tenant_id = ?', [
                nuevoStock,
                insumo_id,
                tenantId
            ]);
            await conn.commit();
            return { nuevoStock };
        } catch (e) {
            await conn.rollback();
            throw e;
        } finally {
            conn.release();
        }
    }

    static async getMovimientos(tenantId, filters = {}) {
        return MovimientoInventarioRepository.findByTenant(tenantId, filters);
    }

    /**
     * Comprueba si hay stock suficiente para preparar N porciones del producto (si tiene receta).
     * @returns {Promise<{ ok: boolean, faltantes?: Array<{ insumo_nombre, requerido, disponible }> }>}
     */
    static async checkStockParaProducto(tenantId, productoId, cantidad = 1) {
        const receta = await RecetaRepository.findByProductoId(productoId, tenantId);
        if (!receta) {
            return { ok: true };
        }
        const ingredientes = await RecetaRepository.getIngredientes(receta.id);
        const porciones = Number.parseFloat(receta.porciones) || 1;
        const factor = (Number.parseFloat(cantidad) || 1) / porciones;

        // Un solo batch fetch en vez de 1 query por ingrediente.
        const insumosPorId = await InsumoRepository.findByIds(
            (ingredientes || []).map(ing => ing.insumo_id),
            tenantId
        );

        const faltantes = (ingredientes || [])
            .map(ing => {
                const insumo = insumosPorId.get(ing.insumo_id);
                if (!insumo) {
                    return null;
                }
                const unidadBase = (insumo.unidad_base || 'g').toString().trim();
                const cantidadRequerida = (Number.parseFloat(ing.cantidad) || 0) * factor;
                const requerido = cantidadABase(cantidadRequerida, ing.unidad || unidadBase);
                const disponible = Number.parseFloat(insumo.stock_actual) || 0;

                if (disponible < requerido) {
                    return {
                        insumo_nombre: insumo.nombre,
                        requerido,
                        disponible,
                        unidad_base: unidadBase
                    };
                }
                return null;
            })
            .filter(Boolean);

        return { ok: faltantes.length === 0, faltantes };
    }

    /**
     * Descuenta inventario por la receta del producto (N porciones). Referencia = factura_id o pedido_id.
     * Convierte cantidad de cada ingrediente a unidad_base del insumo.
     * Procesado de forma concurrente y paralela para optimizar transacciones.
     */
    static async descontarPorReceta(tenantId, productoId, cantidad, referencia) {
        const receta = await RecetaRepository.findByProductoId(productoId, tenantId);
        if (!receta) {
            return;
        }
        const ingredientes = await RecetaRepository.getIngredientes(receta.id);
        const porciones = Number.parseFloat(receta.porciones) || 1;
        const factor = (Number.parseFloat(cantidad) || 1) / porciones;

        // Un solo batch fetch para resolver unidad_base de todos los ingredientes.
        // registrarSalida sigue leyendo su propio insumo internamente: necesita el
        // stock_actual fresco al momento de escribir, no el de este batch de lectura.
        const insumosPorId = await InsumoRepository.findByIds(
            (ingredientes || []).map(ing => ing.insumo_id),
            tenantId
        );

        await Promise.all(
            (ingredientes || []).map(async ing => {
                const insumo = insumosPorId.get(ing.insumo_id);
                if (!insumo) {
                    return;
                }
                const cantidadRequerida = (Number.parseFloat(ing.cantidad) || 0) * factor;
                const cantidadEnBase = cantidadABase(cantidadRequerida, ing.unidad || insumo.unidad_base || 'g');
                if (cantidadEnBase > 0) {
                    await this.registrarSalida(tenantId, {
                        insumo_id: ing.insumo_id,
                        cantidad: cantidadEnBase,
                        referencia: referencia || `Receta producto ${productoId}`
                    });
                }
            })
        );
    }

    /**
     * Descuenta inventario por los toppings/modificadores vendidos en una factura.
     * Lee el snapshot de insumo guardado en detalle_factura_modificadores (columnas
     * insumo_id / cantidad_insumo / unidad_insumo) y genera una salida por insumo.
     * Cantidad = cantidad_insumo de la opción * cantidad de la línea de factura.
     * Igual que las recetas: si no hay stock suficiente, avisa (warn) y permite negativo.
     * @param {number} tenantId
     * @param {number} facturaId
     */
    static async descontarPorModificadoresFactura(tenantId, facturaId) {
        const [filas] = await db.query(
            `SELECT dfm.insumo_id, dfm.cantidad_insumo, dfm.unidad_insumo, df.cantidad AS cantidad_linea
             FROM detalle_factura_modificadores dfm
             JOIN detalle_factura df ON df.id = dfm.detalle_factura_id
             WHERE df.factura_id = ? AND dfm.insumo_id IS NOT NULL AND dfm.cantidad_insumo > 0`,
            [facturaId]
        );
        if (filas.length === 0) {
            return;
        }

        // Varias opciones pueden apuntar al mismo insumo: se acumula y se hace una
        // sola salida por insumo (menos movimientos, mismo resultado).
        const porInsumo = new Map();
        for (const f of filas) {
            const cantidadTotal =
                (Number.parseFloat(f.cantidad_insumo) || 0) * (Number.parseFloat(f.cantidad_linea) || 1);
            const enBase = cantidadABase(cantidadTotal, f.unidad_insumo || 'g');
            if (enBase > 0) {
                porInsumo.set(f.insumo_id, (porInsumo.get(f.insumo_id) || 0) + enBase);
            }
        }

        await Promise.all(
            [...porInsumo.entries()].map(([insumoId, cantidad]) =>
                this.registrarSalida(tenantId, {
                    insumo_id: insumoId,
                    cantidad,
                    referencia: `factura_${facturaId} (toppings)`
                }).catch(err => {
                    console.error('Error al descontar insumo de topping:', err);
                })
            )
        );
    }

    static async getResumenValorizacion(tenantId) {
        const insumos = await InsumoRepository.findAll(tenantId, {});

        // Agregación inmutable y pura usando .reduce
        const valorizacion = (insumos || []).reduce(
            (acc, i) => {
                const stock = Number.parseFloat(i.stock_actual) || 0;
                if (stock <= 0) {
                    return acc;
                }

                // Un ajuste manual (merma, corrección de cocina) mueve stock_actual pero no
                // stock_valorizado: usar el mínimo evita que ese stock "gratis" (o el que ya
                // no existe físicamente) infle o desinfle el valor reportado del inventario.
                const stockValorizado = Number.parseFloat(i.stock_valorizado) || 0;
                const stockParaValorizar = Math.max(0, Math.min(stock, stockValorizado));

                let costo =
                    i.costo_promedio !== null && i.costo_promedio !== undefined
                        ? Number.parseFloat(i.costo_promedio)
                        : 0;
                if (costo === 0) {
                    if (i.categoria_nombre === 'Cerámicas' && Number.parseFloat(i.precio_venta) > 0) {
                        costo = Number.parseFloat(i.precio_venta);
                    } else if (Number.parseFloat(i.precio_compra) > 0 && Number.parseFloat(i.cantidad_compra) > 0) {
                        costo = Number.parseFloat(i.precio_compra) / Number.parseFloat(i.cantidad_compra);
                    }
                }

                return {
                    valorTotal: acc.valorTotal + stockParaValorizar * costo,
                    itemsContados: acc.itemsContados + 1
                };
            },
            { valorTotal: 0, itemsContados: 0 }
        );

        return {
            total_insumos: (insumos || []).length,
            con_stock: valorizacion.itemsContados,
            valor_total: Math.round(valorizacion.valorTotal * 100) / 100
        };
    }

    /**
     * Insumos con stock actual <= stock mínimo (para alertas en dashboard).
     * @returns {Promise<{ cantidad: number, lista: Array }>}
     */
    static async getResumenBajoStock(tenantId) {
        const insumos = await InsumoRepository.findAll(tenantId, {});
        const lista = (insumos || [])
            .filter(i => {
                const actual = Number.parseFloat(i.stock_actual) || 0;
                const min = Number.parseFloat(i.stock_minimo) || 0;
                return actual <= min;
            })
            .map(i => ({
                id: i.id,
                codigo: i.codigo,
                nombre: i.nombre,
                stock_actual: Number.parseFloat(i.stock_actual) || 0,
                stock_minimo: Number.parseFloat(i.stock_minimo) || 0,
                unidad_base: i.unidad_base || 'g'
            }));
        return { cantidad: lista.length, lista: lista.slice(0, 10) };
    }

    /**
     * Lista de mercado: insumos bajo stock o cerca del mínimo (para compras).
     * @param {number} tenantId
     * @param {boolean} incluirCerca - si true, incluye insumos con stock <= 120% del mínimo
     */
    static async getListaMercado(tenantId, incluirCerca = false) {
        const insumos = await InsumoRepository.findAll(tenantId, {});
        const lista = (insumos || [])
            .filter(i => {
                const actual = Number.parseFloat(i.stock_actual) || 0;
                const min = Number.parseFloat(i.stock_minimo) || 0;
                if (actual <= min) {
                    return true;
                }
                if (incluirCerca && min > 0 && actual <= min * 1.2) {
                    return true;
                }
                return false;
            })
            .map(i => ({
                id: i.id,
                codigo: i.codigo,
                nombre: i.nombre,
                stock_actual: Number.parseFloat(i.stock_actual) || 0,
                stock_minimo: Number.parseFloat(i.stock_minimo) || 0,
                unidad_base: i.unidad_base || 'g',
                bajo: (Number.parseFloat(i.stock_actual) || 0) <= (Number.parseFloat(i.stock_minimo) || 0)
            }));
        return { lista };
    }
}

module.exports = InventarioService;
