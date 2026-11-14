/**
 * InventarioService - Movimientos, stock y valorización (promedio ponderado).
 * Recetas usan insumos; al facturar se generan salidas.
 */

const db = require('../../config/database');
const InsumoRepository = require('../../repositories/Tenant/InsumoRepository');
const MovimientoInventarioRepository = require('../../repositories/Tenant/MovimientoInventarioRepository');
const RecetaRepository = require('../../repositories/Tenant/RecetaRepository');
const ComboRepository = require('../../repositories/Tenant/ComboRepository');
const ComboVentaRepository = require('../../repositories/Tenant/ComboVentaRepository');
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

async function registrarGastoFinanzasSiAplica(tenantId, insumo, insumoId, cant, costo, { usuario_id, conn } = {}) {
    if (!costo || costo <= 0 || cant <= 0) {
        return;
    }

    const FinanzasService = require('./FinanzasService');
    try {
        await FinanzasService.registrarGastoInventario(tenantId, {
            monto: costo * cant,
            insumo_nombre: insumo.nombre,
            mov_id: insumoId,
            categoria_nombre: insumo.categoria_nombre,
            usuario_id,
            conn
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
        { insumo_id, cantidad, costo_unitario, referencia, proveedor_id, documento_referencia, usuario_id }
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
            // Misma conexión: el egreso se confirma o revierte junto con la entrada (antes iba por otra
            // conexión del pool y sobrevivía a un rollback).
            await registrarGastoFinanzasSiAplica(tenantId, insumo, insumo_id, cant, costo, { usuario_id, conn });
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
            // Resta atómica en la BD: antes se escribía stockActual - cant calculado
            // sobre una lectura previa (fuera de la transacción), y dos ventas
            // simultáneas del mismo insumo se pisaban (se perdía un descuento).
            await conn.query(
                'UPDATE insumos SET stock_actual = COALESCE(stock_actual, 0) - ?, stock_valorizado = COALESCE(stock_valorizado, 0) - ? WHERE id = ? AND tenant_id = ?',
                [cant, cant, insumo_id, tenantId]
            );
            const [[fila]] = await conn.query('SELECT stock_actual FROM insumos WHERE id = ?', [insumo_id]);
            await conn.commit();
            return { nuevoStock: Number.parseFloat(fila?.stock_actual) || 0 };
        } catch (e) {
            await conn.rollback();
            throw e;
        } finally {
            conn.release();
        }
    }

    /**
     * Varias salidas de inventario en UNA transacción y UNA conexión (antes: una conexión, una transacción y
     * 4 consultas por ingrediente, lo que saturaba el pool de 10 conexiones al cobrar). Misma semántica que
     * registrarSalida: un movimiento por insumo, resta atómica en la BD y stock negativo permitido (con aviso).
     * Las cantidades del mismo insumo se suman; los insumos se procesan en orden de id para que dos ventas
     * simultáneas bloqueen las filas en el mismo orden y no se cruce un deadlock.
     * @param {number} tenantId
     * @param {Array<{insumo_id:number, cantidad:number}>} salidas - cantidades YA en unidad base
     * @param {string} referencia
     * @param {Object|null} [externa] - conexión de una transacción ajena (la de la factura): las salidas se
     *   escriben en ELLA y quien la abrió hace el commit/rollback. Es obligatorio dentro de la transacción de
     *   una venta: otra conexión del pool quedaría esperando (lock wait) la fila del tenant que la venta tiene
     *   bloqueada hasta el commit, y no vería las filas todavía sin confirmar.
     * @returns {Promise<{insumos:number}>}
     */
    static async registrarSalidasLote(tenantId, salidas, referencia, externa = null) {
        const porInsumo = new Map();
        for (const s of salidas || []) {
            const cant = Number.parseFloat(s.cantidad);
            if (s.insumo_id && cant > 0) {
                porInsumo.set(s.insumo_id, (porInsumo.get(s.insumo_id) || 0) + cant);
            }
        }
        if (porInsumo.size === 0) {
            return { insumos: 0 };
        }

        const insumos = await InsumoRepository.findByIds([...porInsumo.keys()], tenantId, externa);
        const ordenados = [...porInsumo.entries()].filter(([id]) => insumos.has(id)).sort((a, b) => a[0] - b[0]);
        if (ordenados.length === 0) {
            return { insumos: 0 };
        }

        const conn = externa || (await db.getConnection());
        try {
            if (!externa) {
                await conn.beginTransaction();
            }
            for (const [insumoId, cant] of ordenados) {
                const insumo = insumos.get(insumoId);
                if ((Number.parseFloat(insumo.stock_actual) || 0) < cant) {
                    console.warn(
                        `[Inventario] Stock insuficiente para ${insumo.nombre}. Disponible: ${insumo.stock_actual}, Requerido: ${cant}. Se permitirá stock negativo.`
                    );
                }
                await conn.query(
                    `INSERT INTO movimientos_inventario (tenant_id, insumo_id, tipo, cantidad, costo_unitario, referencia) VALUES (?, ?, 'salida', ?, ?, ?)`,
                    [tenantId, insumoId, cant, insumo.costo_promedio, referencia || null]
                );
                await conn.query(
                    'UPDATE insumos SET stock_actual = COALESCE(stock_actual, 0) - ?, stock_valorizado = COALESCE(stock_valorizado, 0) - ? WHERE id = ? AND tenant_id = ?',
                    [cant, cant, insumoId, tenantId]
                );
            }
            if (!externa) {
                await conn.commit();
            }
            return { insumos: ordenados.length };
        } catch (e) {
            if (!externa) {
                await conn.rollback();
            }
            throw e;
        } finally {
            if (!externa) {
                conn.release();
            }
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
        // Combo: se valida la receta de cada componente (cantidad del combo x cantidad del componente).
        const componentes = await ComboRepository.getComponentes(productoId, tenantId);
        if (componentes.length > 0) {
            const faltantes = [];
            for (const c of componentes) {
                const r = await this._checkStockReceta(
                    tenantId,
                    c.producto_id,
                    (Number.parseFloat(cantidad) || 1) * Number(c.cantidad)
                );
                faltantes.push(...(r.faltantes || []));
            }
            return { ok: faltantes.length === 0, faltantes };
        }
        return this._checkStockReceta(tenantId, productoId, cantidad);
    }

    static async _checkStockReceta(tenantId, productoId, cantidad = 1) {
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
     * Faltantes de stock de lo elegido en combos armados (selecciones del snapshot de
     * ComboArmableService.validarSeleccion), x cantidad de combos. Solo informa: cada llamador
     * decide si bloquea la venta (POS) o solo avisa (Mesas).
     */
    static async checkStockParaSelecciones(tenantId, selecciones, cantidadCombos = 1) {
        const faltantes = [];
        for (const s of selecciones) {
            const check = await this.checkStockParaProducto(
                tenantId,
                s.producto_id,
                Number(s.cantidad) * Number(cantidadCombos)
            );
            if (!check.ok) {
                faltantes.push(...(check.faltantes || []));
            }
        }
        return { ok: faltantes.length === 0, faltantes };
    }

    /**
     * Combos armados de una factura: descuenta la receta de cada producto elegido x su cantidad
     * x combos vendidos. Sin `conn` es best-effort (nunca lanza); con `conn` (dentro de la venta) propaga el error.
     */
    static async descontarPorCombosFactura(tenantId, facturaId, conn = null) {
        try {
            const selecciones = await ComboVentaRepository.getSeleccionesPorFactura(facturaId, conn || undefined);
            for (const s of selecciones) {
                await this.descontarPorReceta(
                    tenantId,
                    s.producto_id,
                    Number(s.cantidad_por_combo) * Number(s.cantidad_combo),
                    'factura_' + facturaId,
                    ...(conn ? [conn] : [])
                );
            }
        } catch (error) {
            // Dentro de la transacción de la venta el error se propaga (se revierte todo); fuera es best-effort.
            if (conn) {
                throw error;
            }
            console.error('Error al descontar inventario de combos:', error);
        }
    }

    /**
     * Descuenta inventario por la receta del producto (N porciones). Referencia = factura_id o pedido_id.
     * Convierte cantidad de cada ingrediente a unidad_base del insumo.
     * Procesado de forma concurrente y paralela para optimizar transacciones.
     */
    static async descontarPorReceta(tenantId, productoId, cantidad, referencia, conn = null) {
        // Combo: se descuenta la receta de cada componente (cantidad del combo x cantidad del componente).
        const componentes = await ComboRepository.getComponentes(productoId, tenantId, conn);
        if (componentes.length > 0) {
            for (const c of componentes) {
                await this._descontarRecetaProducto(
                    tenantId,
                    c.producto_id,
                    (Number.parseFloat(cantidad) || 1) * Number(c.cantidad),
                    referencia,
                    ...(conn ? [conn] : [])
                );
            }
            return;
        }
        await this._descontarRecetaProducto(tenantId, productoId, cantidad, referencia, ...(conn ? [conn] : []));
    }

    /**
     * Ingredientes de la receta de un producto ya convertidos a unidad base del insumo (para N porciones).
     * Solo lee: no escribe nada. Devuelve [] si el producto no tiene receta.
     */
    static async _ingredientesEnBase(tenantId, productoId, cantidad, conn = null) {
        const receta = await RecetaRepository.findByProductoId(productoId, tenantId, conn);
        if (!receta) {
            return [];
        }
        const ingredientes = await RecetaRepository.getIngredientes(receta.id, conn);
        const porciones = Number.parseFloat(receta.porciones) || 1;
        const factor = (Number.parseFloat(cantidad) || 1) / porciones;

        // Un solo batch fetch para resolver unidad_base de todos los ingredientes.
        const insumosPorId = await InsumoRepository.findByIds(
            (ingredientes || []).map(ing => ing.insumo_id),
            tenantId,
            conn
        );

        const salidas = [];
        for (const ing of ingredientes || []) {
            const insumo = insumosPorId.get(ing.insumo_id);
            if (!insumo) {
                continue;
            }
            const cantidadRequerida = (Number.parseFloat(ing.cantidad) || 0) * factor;
            const cantidadEnBase = cantidadABase(cantidadRequerida, ing.unidad || insumo.unidad_base || 'g');
            if (cantidadEnBase > 0) {
                salidas.push({ insumo_id: ing.insumo_id, cantidad: cantidadEnBase });
            }
        }
        return salidas;
    }

    static async _descontarRecetaProducto(tenantId, productoId, cantidad, referencia, conn = null) {
        const salidas = await this._ingredientesEnBase(tenantId, productoId, cantidad, conn);
        await this.registrarSalidasLote(tenantId, salidas, referencia || `Receta producto ${productoId}`, conn);
    }

    /**
     * Descuenta TODA la receta de una factura de una vez: recorre las líneas (resolviendo combos a sus
     * componentes), suma los ingredientes por insumo y hace una sola transacción. Un producto con la
     * receta rota no impide descontar los demás (se registra y se sigue), como antes.
     * @param {Array<{producto_id:number, cantidad:number}>} lineas
     */
    static async descontarProductosLote(tenantId, lineas, referencia, conn = null) {
        const acumulado = [];
        for (const l of lineas || []) {
            try {
                const cant = Number.parseFloat(l.cantidad) || 1;
                const componentes = await ComboRepository.getComponentes(l.producto_id, tenantId, conn);
                if (componentes.length > 0) {
                    for (const c of componentes) {
                        acumulado.push(
                            ...(await this._ingredientesEnBase(
                                tenantId,
                                c.producto_id,
                                cant * Number(c.cantidad),
                                conn
                            ))
                        );
                    }
                } else {
                    acumulado.push(...(await this._ingredientesEnBase(tenantId, l.producto_id, cant, conn)));
                }
            } catch (err) {
                console.error('Error al calcular el descuento de inventario por receta:', err);
            }
        }
        await this.registrarSalidasLote(tenantId, acumulado, referencia, conn);
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
    static async descontarPorModificadoresFactura(tenantId, facturaId, conn = null) {
        const [filas] = await (conn || db).query(
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

        try {
            await this.registrarSalidasLote(
                tenantId,
                [...porInsumo.entries()].map(([insumo_id, cantidad]) => ({ insumo_id, cantidad })),
                `factura_${facturaId} (toppings)`,
                conn
            );
        } catch (err) {
            // Dentro de la transacción de la venta el error debe propagarse (la venta se revierte entera);
            // fuera de ella (reprocesos) sigue siendo best-effort.
            if (conn) {
                throw err;
            }
            console.error('Error al descontar insumo de topping:', err);
        }
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
